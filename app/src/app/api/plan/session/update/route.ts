import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const ALLOWED_STATUSES = new Set(['planned', 'done', 'skipped'])

// Manual override for a single planned session — "bocka av" / "hoppa över" /
// undo. 'missed' is deliberately not settable here: it's only ever assigned
// by the week-finalization job (reconcilePlanWeek) once a week closes, never
// by the user directly.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, status } = await request.json() as { sessionId: string; status: string }
  if (!sessionId || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Ogiltig förfrågan' }, { status: 400 })
  }

  // RLS (auth.uid() = user_id on plan_sessions) already scopes this to the
  // caller's own row — the explicit .eq is defense in depth, not the only
  // guard.
  const update: { status: string; completed_at: string | null; matched_activity_id?: null } = {
    status,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  }
  // Undoing back to 'planned' or skipping clears any auto-matched activity
  // link — a manual 'done' click leaves it alone (there's nothing to clear
  // yet; auto-match only ever runs separately via the sync cron).
  if (status !== 'done') update.matched_activity_id = null

  const { error } = await supabase
    .from('plan_sessions')
    .update(update)
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Plan session update error:', error)
    return NextResponse.json({ error: 'Kunde inte uppdatera passet' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
