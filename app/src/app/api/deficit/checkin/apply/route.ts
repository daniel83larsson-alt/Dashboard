import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { estimateBMR } from '@/lib/bmr'
import { computeDeficitBudget } from '@/lib/deficit'

type Body = { checkinId: string }

// Applies a checkin's suggested correction factor — never automatic, only
// on explicit user action (the "Använd"/"Behåll" choice in the UI).
// Updates profiles.deficit_garmin_correction and re-freezes the budget
// snapshot (same trigger the Profil save already uses), so the new budget
// shows immediately without waiting for the user to touch Profil.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Body
  if (!body.checkinId) return NextResponse.json({ error: 'checkinId saknas' }, { status: 400 })

  const { data: checkin } = await supabase
    .from('deficit_checkins')
    .select('id, suggested_correction, applied_correction')
    .eq('id', body.checkinId)
    .eq('user_id', user.id)
    .single()

  if (!checkin) return NextResponse.json({ error: 'Avstämningen hittades inte' }, { status: 404 })
  if (checkin.suggested_correction == null) return NextResponse.json({ error: 'Den här avstämningen har ingen föreslagen justering' }, { status: 400 })
  if (checkin.applied_correction != null) return NextResponse.json({ error: 'Redan applicerad' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('weight_kg, height_cm, birth_year, biological_sex, deficit_start_weight_kg, deficit_target_weight_kg, deficit_target_date, deficit_neat_factor, deficit_activity_fallback_kcal')
    .eq('id', user.id)
    .single()

  const newCorrection = checkin.suggested_correction

  let budgetFields: { deficit_tdee_kcal?: number; deficit_budget_kcal?: number; deficit_budget_computed_at?: string } = {}
  if (profile?.deficit_start_weight_kg != null && profile.deficit_target_weight_kg != null && profile.deficit_target_date) {
    const bmr = estimateBMR({
      weightKg: profile.weight_kg, heightCm: profile.height_cm, birthYear: profile.birth_year, biologicalSex: profile.biological_sex,
    }).bmr
    const budget = computeDeficitBudget({
      bmr,
      goal: {
        startWeightKg: profile.deficit_start_weight_kg,
        targetWeightKg: profile.deficit_target_weight_kg,
        targetDateISO: profile.deficit_target_date,
        neatFactor: profile.deficit_neat_factor ?? 1.25,
        garminCorrection: newCorrection,
      },
      avgTrainingKcalRaw: null, // recomputed fresh at next Profil save; this apply just needs the new correction reflected
      activityFallbackKcal: profile.deficit_activity_fallback_kcal ?? 300,
      now: new Date(),
    })
    budgetFields = { deficit_tdee_kcal: budget.tdeeKcal, deficit_budget_kcal: budget.budgetKcal, deficit_budget_computed_at: new Date().toISOString() }
  }

  await supabase.from('profiles').update({ deficit_garmin_correction: newCorrection, ...budgetFields }).eq('id', user.id)
  await supabase.from('deficit_checkins').update({ applied_correction: newCorrection }).eq('id', checkin.id)

  return NextResponse.json({ ok: true, newCorrection, ...budgetFields })
}
