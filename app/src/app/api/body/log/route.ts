import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type Body = { date: string; weightKg?: number; waistCm?: number; note?: string }

// Logs a weight and/or waist measurement for a given date — the only place
// in the app a Garmin-only or manual-only user can build a weight history
// at all (Garmin's own sync never fetches body weight, and profiles.weight_kg
// is a single current value, not a log). Upserts on (user_id, measured_on,
// 'manual'), so weighing in twice the same day replaces the row instead of
// creating a duplicate.
//
// Daniel's confirmed call: a weight entry also updates profiles.weight_kg,
// same as if he'd edited it in Profil himself — otherwise BMR and manually-
// logged-pass calories would silently drift stale as the real weight moves.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Body
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 })
  const todayKey = new Date().toISOString().slice(0, 10)
  if (body.date > todayKey) return NextResponse.json({ error: 'Kan inte logga ett framtida datum' }, { status: 400 })

  const weightKg = body.weightKg != null && Number.isFinite(body.weightKg) && body.weightKg > 0 && body.weightKg < 400 ? body.weightKg : null
  const waistCm = body.waistCm != null && Number.isFinite(body.waistCm) && body.waistCm > 0 && body.waistCm < 300 ? body.waistCm : null
  if (weightKg == null && waistCm == null) return NextResponse.json({ error: 'Ange vikt eller midjemått' }, { status: 400 })

  const { data: entry, error } = await supabase.from('body_measurements').upsert({
    user_id: user.id,
    measured_on: body.date,
    weight_kg: weightKg,
    waist_cm: waistCm,
    source: 'manual',
    note: body.note?.trim().slice(0, 200) || null,
  }, { onConflict: 'user_id,measured_on,source' }).select().single()

  if (error) {
    console.error('Body measurement upsert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
  }

  if (weightKg != null) {
    await supabase.from('profiles').update({ weight_kg: weightKg }).eq('id', user.id)
  }

  return NextResponse.json({ ok: true, entry })
}
