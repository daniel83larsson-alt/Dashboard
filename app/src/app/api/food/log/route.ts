import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { KOST_MEALS, type KostMeal } from '@/lib/kost'
import { stockholmDateKey } from '@/lib/dates'

type LogBody = {
  name: string
  source: 'database' | 'ai_text' | 'photo'
  offId?: string
  grams?: number
  baseKcal?: number
  baseProteinG?: number
  baseCarbG?: number
  baseFatG?: number
  multiplier?: number
  meal?: KostMeal
  loggedDate?: string
}

// Noon UTC for a given Stockholm calendar day, so the stored instant lands
// on the intended date regardless of which side of a UTC-midnight
// boundary the viewer's timezone puts it on (same class of bug the
// entriesByDate key computation elsewhere in Kost was fixed for). Never
// allows a future date — retroactive editing only goes backward.
function loggedAtFor(loggedDate: string | undefined): string | null {
  if (!loggedDate) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(loggedDate)) return null
  if (loggedDate > stockholmDateKey()) return null
  return `${loggedDate}T12:00:00.000Z`
}

const ALLOWED_SOURCES = new Set(['database', 'ai_text', 'photo'])

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// Same OFF product used by /api/food/search, refetched fresh by code — the
// client's displayed kcal/protein is never trusted and stored as-is,
// matching the log-manual precedent of always computing money/calorie-
// sensitive numbers server-side.
async function fetchOffNutrients(offId: string): Promise<{ kcalPer100g: number; proteinPer100g: number | null; carbPer100g: number | null; fatPer100g: number | null } | null> {
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
    if (!kcal || kcal <= 0) return null
    const protein = n?.proteins_100g
    const carb = n?.carbohydrates_100g
    const fat = n?.fat_100g
    return {
      kcalPer100g: kcal,
      proteinPer100g: protein != null && protein >= 0 ? protein : null,
      carbPer100g: carb != null && carb >= 0 ? carb : null,
      fatPer100g: fat != null && fat >= 0 ? fat : null,
    }
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
  if (body.meal != null && !(KOST_MEALS as string[]).includes(body.meal)) return NextResponse.json({ error: 'Okänd måltid' }, { status: 400 })
  if (body.loggedDate != null && loggedAtFor(body.loggedDate) == null) return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 })

  let calories: number
  let proteinG: number | null = null
  let carbG: number | null = null
  let fatG: number | null = null
  let quantity: number | null = null
  let unit: 'g' | 'portion' | null = null
  let kcalPer100g: number | null = null
  let proteinPer100g: number | null = null
  let offId: string | null = null

  if (body.source === 'database') {
    const grams = body.grams
    if (!body.offId || !grams || grams <= 0) return NextResponse.json({ error: 'Portion saknas' }, { status: 400 })
    const fresh = await fetchOffNutrients(body.offId)
    if (!fresh) return NextResponse.json({ error: 'Kunde inte hämta näringsvärde — försök igen' }, { status: 502 })
    calories = Math.round(fresh.kcalPer100g * grams / 100)
    proteinG = fresh.proteinPer100g != null ? Math.round(fresh.proteinPer100g * grams / 100 * 10) / 10 : null
    carbG = fresh.carbPer100g != null ? Math.round(fresh.carbPer100g * grams / 100 * 10) / 10 : null
    fatG = fresh.fatPer100g != null ? Math.round(fresh.fatPer100g * grams / 100 * 10) / 10 : null
    quantity = grams
    unit = 'g'
    kcalPer100g = fresh.kcalPer100g
    proteinPer100g = fresh.proteinPer100g
    offId = body.offId
  } else {
    const baseKcal = body.baseKcal
    const multiplier = body.multiplier ?? 1
    if (!baseKcal || !Number.isFinite(baseKcal) || baseKcal <= 0) return NextResponse.json({ error: 'Kalorivärde saknas' }, { status: 400 })
    if (!Number.isFinite(multiplier) || multiplier <= 0) return NextResponse.json({ error: 'Ogiltig portionsstorlek' }, { status: 400 })
    calories = clamp(Math.round(baseKcal * multiplier), 0, 4000)
    if (body.baseProteinG != null && Number.isFinite(body.baseProteinG) && body.baseProteinG >= 0) {
      proteinG = clamp(Math.round(body.baseProteinG * multiplier * 10) / 10, 0, 400)
    }
    if (body.baseCarbG != null && Number.isFinite(body.baseCarbG) && body.baseCarbG >= 0) {
      carbG = clamp(Math.round(body.baseCarbG * multiplier * 10) / 10, 0, 1000)
    }
    if (body.baseFatG != null && Number.isFinite(body.baseFatG) && body.baseFatG >= 0) {
      fatG = clamp(Math.round(body.baseFatG * multiplier * 10) / 10, 0, 500)
    }
    quantity = multiplier
    unit = 'portion'
  }

  const loggedAt = loggedAtFor(body.loggedDate)

  const { data: entry, error } = await supabase.from('food_log').insert({
    user_id: user.id,
    name,
    calories,
    source: body.source,
    quantity,
    unit,
    kcal_per_100g: kcalPer100g,
    off_id: offId,
    protein_g: proteinG,
    protein_per_100g: proteinPer100g,
    carb_g: carbG,
    fat_g: fatG,
    meal: body.meal ?? null,
    ...(loggedAt ? { logged_at: loggedAt } : {}),
  }).select().single()

  if (error) {
    console.error('Food log insert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, entry })
}
