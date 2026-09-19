import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { recomputeProteinGoal } from '@/lib/protein-goal-refreeze'

// Self-service, not admin-gated (unlike /api/deficit/budget/refreeze's
// manual_test) — this is any user flipping their own "Räkna automatiskt"
// checkbox back on in Profil, a normal action every account can take.
// Sets protein_goal_mode='auto' first so recomputeProteinGoal's own gate
// (only acts when mode is already 'auto') passes, then computes right
// away — same "manuell ändring triggar direkt" principle as delmål.
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

  await supabase.from('profiles').update({ protein_goal_mode: 'auto' }).eq('id', user.id)
  const result = await recomputeProteinGoal(supabase, user.id)

  return NextResponse.json({ ok: true, result })
}
