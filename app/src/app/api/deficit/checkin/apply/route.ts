import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { refreezeDeficitBudget } from '@/lib/deficit-budget-refreeze'

type Body = { checkinId: string }

// Applies a checkin's suggested correction factor — never automatic, only
// on explicit user action (the "Använd"/"Behåll" choice in the UI).
// Updates profiles.deficit_garmin_correction and re-freezes the budget
// snapshot (same server-side path Profil save now uses), so the new budget
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

  const newCorrection = checkin.suggested_correction

  // Correction must land before the refreeze — it reads the profile fresh,
  // so this order is what lets it see the new correction factor.
  await supabase.from('profiles').update({ deficit_garmin_correction: newCorrection }).eq('id', user.id)
  const result = await refreezeDeficitBudget(supabase, user.id, 'checkin_applied')
  await supabase.from('deficit_checkins').update({ applied_correction: newCorrection }).eq('id', checkin.id)

  const budgetFields = result
    ? { deficit_tdee_kcal: result.after.tdeeKcal, deficit_budget_kcal: result.after.budgetKcal, deficit_budget_computed_at: new Date().toISOString() }
    : {}

  return NextResponse.json({ ok: true, newCorrection, ...budgetFields })
}
