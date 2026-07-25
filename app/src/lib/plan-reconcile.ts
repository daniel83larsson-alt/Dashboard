// Writes real matches back to plan_sessions — the counterpart to
// weekly-digest.ts's matchAdherence, which computes the same thing
// read-only for the digest. Runs once a day from the sync-all cron (right
// after new activities land) so a session's checkmark appears on its own,
// without the user having to "bocka av" manually.
//
// Rule, per Daniel: loose sport-only matching (same as the digest's
// adherence calc) is good enough — if today's session is "reasonably
// close" to what was planned, that counts. Sessions in the CURRENT week
// stay 'planned' until matched (the week isn't over, still time). Sessions
// in a week that's already ended and never got matched become 'missed' —
// a single-day 'skipped' equivalent that the UI intentionally shows without
// an "Ångra" button (see WeeklyPlanCard), since undoing a closed past week
// doesn't mean anything. Manual 'skipped' (the user's own "Hoppa över"
// button) is untouched by this job — that's a deliberate choice made
// during the week, not an automatic finalization.
import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfWeek } from './dates'
import { dedupeForStats, type ActivityRow } from './duplicates'
import { activitiesInWeek, greedySportMatch, type PlanSessionRow } from './weekly-digest'

export type ReconcilableSession = PlanSessionRow & { id: string }

export type ReconcileDecision =
  | { session: ReconcilableSession; action: 'done'; activityId: string }
  | { session: ReconcilableSession; action: 'missed' }
  | { session: ReconcilableSession; action: 'none' }

// Pure decision logic, split out from the I/O wrapper below so it's
// unit-testable without a real (or mocked) Supabase client — same split as
// the rest of the plan-related code (weekly-digest.ts stays pure, only its
// I/O-touching caller isn't unit tested).
export function planReconcileDecisions(
  planned: ReconcilableSession[],
  activities: ActivityRow[],
  now: Date = new Date()
): ReconcileDecision[] {
  const deduped = dedupeForStats(activities)
  const currentWeekStart = startOfWeek(now)

  const byWeek = new Map<string, ReconcilableSession[]>()
  for (const s of planned) {
    const key = startOfWeek(new Date(s.planned_date)).toISOString().slice(0, 10)
    const arr = byWeek.get(key) ?? []
    arr.push(s)
    byWeek.set(key, arr)
  }

  const decisions: ReconcileDecision[] = []
  for (const [weekKey, weekSessions] of byWeek) {
    const weekStart = new Date(weekKey)
    const isPastWeek = weekStart.getTime() < currentWeekStart.getTime()
    const weekActs = activitiesInWeek(deduped, weekStart)
    const pairs = greedySportMatch(weekSessions, weekActs)

    for (const { session, activity } of pairs) {
      if (activity) decisions.push({ session, action: 'done', activityId: activity.id })
      else if (isPastWeek) decisions.push({ session, action: 'missed' })
      else decisions.push({ session, action: 'none' })
    }
  }
  return decisions
}

export async function reconcileUserPlanSessions(
  supabase: SupabaseClient,
  userId: string,
  activities: ActivityRow[],
  now: Date = new Date()
): Promise<{ matched: number; missed: number }> {
  const { data: sessions } = await supabase
    .from('plan_sessions')
    .select('id, planned_date, is_rest, sport_type, title')
    .eq('user_id', userId)
    .eq('status', 'planned')

  const planned = (sessions ?? []) as ReconcilableSession[]
  if (!planned.length) return { matched: 0, missed: 0 }

  const decisions = planReconcileDecisions(planned, activities, now)

  let matched = 0
  let missed = 0
  for (const d of decisions) {
    if (d.action === 'done') {
      await supabase.from('plan_sessions').update({
        status: 'done',
        matched_activity_id: d.activityId,
        completed_at: now.toISOString(),
      }).eq('id', d.session.id)
      matched++
    } else if (d.action === 'missed') {
      await supabase.from('plan_sessions').update({ status: 'missed' }).eq('id', d.session.id)
      missed++
    }
  }

  return { matched, missed }
}
