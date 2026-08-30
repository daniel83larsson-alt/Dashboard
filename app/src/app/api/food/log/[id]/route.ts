import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { KOST_MEALS, type KostMeal } from '@/lib/kost'

type PatchBody = {
  name?: string
  calories?: number
  proteinG?: number | null
  carbG?: number | null
  fatG?: number | null
  meal?: KostMeal | null
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// Lets the user correct a scanned/AI-estimated entry after the fact — the
// same "always editable" requirement as the initial logging form, just
// applied retroactively (Daniel: redigera scannat/fotat i efterhand).
// Scoped to the caller's own row via both RLS and an explicit user_id
// check, matching the app's existing pattern for user-owned mutations.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as PatchBody
  const update: Record<string, unknown> = {}

  if (body.name != null) {
    const name = body.name.trim().slice(0, 200)
    if (!name) return NextResponse.json({ error: 'Namn saknas' }, { status: 400 })
    update.name = name
  }
  if (body.calories != null) {
    if (!Number.isFinite(body.calories) || body.calories < 0) return NextResponse.json({ error: 'Ogiltigt kalorivärde' }, { status: 400 })
    update.calories = clamp(Math.round(body.calories), 0, 4000)
  }
  if ('proteinG' in body) update.protein_g = body.proteinG != null && Number.isFinite(body.proteinG) ? clamp(body.proteinG, 0, 400) : null
  if ('carbG' in body) update.carb_g = body.carbG != null && Number.isFinite(body.carbG) ? clamp(body.carbG, 0, 1000) : null
  if ('fatG' in body) update.fat_g = body.fatG != null && Number.isFinite(body.fatG) ? clamp(body.fatG, 0, 500) : null
  if ('meal' in body) {
    if (body.meal != null && !(KOST_MEALS as string[]).includes(body.meal)) return NextResponse.json({ error: 'Okänd måltid' }, { status: 400 })
    update.meal = body.meal ?? null
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })

  const { data: entry, error } = await supabase
    .from('food_log')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Food log update error:', error)
    return NextResponse.json({ error: 'Kunde inte uppdatera' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, entry })
}
