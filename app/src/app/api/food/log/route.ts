import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type LogBody = {
  name: string
  source: 'database' | 'ai_text' | 'photo'
  offId?: string
  grams?: number
  baseKcal?: number
  multiplier?: number
}

const ALLOWED_SOURCES = new Set(['database', 'ai_text', 'photo'])

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// Same OFF product used by /api/food/search, refetched fresh by code — the
// client's displayed kcal is never trusted and stored as-is, matching the
// log-manual precedent of always computing money/calorie-sensitive numbers
// server-side.
async function fetchOffKcalPer100g(offId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(offId)}?fields=nutriments`, {
      headers: { 'User-Agent': 'DL-Trainer/1.0 (kalorifunktion)' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const n = data.product?.nutriments
    const kcalDirect = n?.['energy-kcal_100g']
    const kcalFromKj = n?.energy_100g != null ? n.energy_100g / 4.184 : undefined
    const kcal = kcalDirect ?? kcalFromKj
    return kcal && kcal > 0 ? kcal : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as LogBody
  const name = body.name?.trim().slice(0, 200)
  if (!name) return NextResponse.json({ error: 'Namn saknas' }, { status: 400 })
  if (!ALLOWED_SOURCES.has(body.source)) return NextResponse.json({ error: 'Okänd källa' }, { status: 400 })

  let calories: number
  let quantity: number | null = null
  let unit: 'g' | 'portion' | null = null
  let kcalPer100g: number | null = null
  let offId: string | null = null

  if (body.source === 'database') {
    const grams = body.grams
    if (!body.offId || !grams || grams <= 0) return NextResponse.json({ error: 'Portion saknas' }, { status: 400 })
    const freshKcalPer100g = await fetchOffKcalPer100g(body.offId)
    if (!freshKcalPer100g) return NextResponse.json({ error: 'Kunde inte hämta näringsvärde — försök igen' }, { status: 502 })
    calories = Math.round(freshKcalPer100g * grams / 100)
    quantity = grams
    unit = 'g'
    kcalPer100g = freshKcalPer100g
    offId = body.offId
  } else {
    const baseKcal = body.baseKcal
    const multiplier = body.multiplier ?? 1
    if (!baseKcal || !Number.isFinite(baseKcal) || baseKcal <= 0) return NextResponse.json({ error: 'Kalorivärde saknas' }, { status: 400 })
    if (!Number.isFinite(multiplier) || multiplier <= 0) return NextResponse.json({ error: 'Ogiltig portionsstorlek' }, { status: 400 })
    calories = clamp(Math.round(baseKcal * multiplier), 0, 4000)
    quantity = multiplier
    unit = 'portion'
  }

  const { data: entry, error } = await supabase.from('food_log').insert({
    user_id: user.id,
    name,
    calories,
    source: body.source,
    quantity,
    unit,
    kcal_per_100g: kcalPer100g,
    off_id: offId,
  }).select().single()

  if (error) {
    console.error('Food log insert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, entry })
}
