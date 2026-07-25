import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { syncGarminForUser, GarminNotConfiguredError } from '@/lib/garmin-sync'
import { withGarminLock } from '@/lib/garmin'
import { syncConcept2ForUser, Concept2NotConnectedError } from '@/lib/concept2-sync'
import { syncStravaForUser, StravaNotConnectedError } from '@/lib/strava-sync'
import { sendPushToUser } from '@/lib/push'
import { reconcileUserPlanSessions } from '@/lib/plan-reconcile'
import type { ActivityRow } from '@/lib/duplicates'

// How far back to pull activities for plan reconciliation — generous
// relative to how young the weekly-plan feature is (plan_sessions only
// exist for the last few weeks at most today), cheap to widen later if
// plans stick around unfinalized longer than expected.
const RECONCILE_LOOKBACK_DAYS = 90

export const maxDuration = 60 // Vercel Hobby plan's hard cap — every user's sync below runs in parallel to fit inside it

// Runs once a day (see vercel.json) so activity + wellness data stays fresh
// even for users who don't open the app that day, instead of only syncing
// on page load. Vercel automatically sends `Authorization: Bearer
// $CRON_SECRET` for scheduled invocations, which is what's checked below —
// this must never be reachable without that secret since it uses the
// service-role client and touches every user's data.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  const [{ data: garminRows }, { data: c2Rows }, { data: stravaRows }, { data: authUsers }] = await Promise.all([
    supabase.from('coach_sessions').select('user_id').eq('coach_id', 'garmin_credentials'),
    supabase.from('concept2_tokens').select('user_id'),
    supabase.from('strava_tokens').select('user_id'),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailByUserId = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  // Garmin syncs are still kicked off "in parallel" here, but withGarminLock
  // (see lib/garmin.ts) forces the actual Garmin HTTP work to run one user
  // at a time — a TEMPORARY mitigation for a cross-user token-leak race in
  // the vendored garmin-connect library (STATUS.md "Teknisk skuld" has the
  // full writeup). This makes the job slower as the Garmin user count
  // grows, eating back into Vercel Hobby's 60s cap; revisit if that becomes
  // tight (batch the cron, or remove this lock once the library is patched).
  const garminSettled = await Promise.allSettled(
    (garminRows ?? []).map(row => withGarminLock(() => syncGarminForUser(supabase, row.user_id, emailByUserId.get(row.user_id))))
  )
  const garmin = garminSettled.map((r, i) => {
    const userId = (garminRows ?? [])[i].user_id
    if (r.status === 'fulfilled') return { userId, ok: true, synced: r.value.synced }
    const isConfigError = r.reason instanceof GarminNotConfiguredError
    return { userId, ok: false, error: isConfigError ? 'not_configured' : (r.reason instanceof Error ? r.reason.message : String(r.reason)) }
  })

  const c2Settled = await Promise.allSettled(
    (c2Rows ?? []).map(row => syncConcept2ForUser(supabase, row.user_id))
  )
  const concept2 = c2Settled.map((r, i) => {
    const userId = (c2Rows ?? [])[i].user_id
    if (r.status === 'fulfilled') return { userId, ok: true, synced: r.value.synced }
    const isConfigError = r.reason instanceof Concept2NotConnectedError
    return { userId, ok: false, error: isConfigError ? 'not_connected' : (r.reason instanceof Error ? r.reason.message : String(r.reason)) }
  })

  const stravaSettled = await Promise.allSettled(
    (stravaRows ?? []).map(row => syncStravaForUser(supabase, row.user_id))
  )
  const strava = stravaSettled.map((r, i) => {
    const userId = (stravaRows ?? [])[i].user_id
    if (r.status === 'fulfilled') return { userId, ok: true, synced: r.value.synced }
    const isConfigError = r.reason instanceof StravaNotConnectedError
    return { userId, ok: false, error: isConfigError ? 'not_connected' : (r.reason instanceof Error ? r.reason.message : String(r.reason)) }
  })

  // Match today's (and any still-open past weeks') plan_sessions against
  // real synced activities — every user with an unfinished planned session
  // is checked, not just users who synced something new today, since a
  // past week needs finalizing (→ 'missed') even with zero new activity.
  const { data: planUserRows } = await supabase
    .from('plan_sessions')
    .select('user_id')
    .eq('status', 'planned')
  const planUserIds = [...new Set((planUserRows ?? []).map(r => r.user_id))]

  const reconcileSince = new Date()
  reconcileSince.setDate(reconcileSince.getDate() - RECONCILE_LOOKBACK_DAYS)
  const reconcileSettled = await Promise.allSettled(
    planUserIds.map(async userId => {
      const { data: acts } = await supabase
        .from('activities')
        .select('id, strava_id, sport_type, distance, moving_time, start_date')
        .eq('user_id', userId)
        .gte('start_date', reconcileSince.toISOString())
      return reconcileUserPlanSessions(supabase, userId, (acts ?? []) as ActivityRow[])
    })
  )
  const reconciled = reconcileSettled.reduce(
    (acc, r) => r.status === 'fulfilled' ? { matched: acc.matched + r.value.matched, missed: acc.missed + r.value.missed } : acc,
    { matched: 0, missed: 0 }
  )

  // One notification per user summarizing everything the whole run found for
  // them, not one per source — nobody wants two separate pings because they
  // happen to have both Garmin and Concept2 connected.
  const newPassesByUser = new Map<string, number>()
  for (const r of [...garmin, ...concept2, ...strava]) {
    if (r.ok && r.synced) newPassesByUser.set(r.userId, (newPassesByUser.get(r.userId) ?? 0) + r.synced)
  }
  await Promise.allSettled(
    [...newPassesByUser.entries()].map(([userId, count]) =>
      sendPushToUser(supabase, userId, {
        title: count === 1 ? 'Nytt pass synkat' : `${count} nya pass synkade`,
        body: count === 1 ? 'Ett nytt pass hämtades idag.' : `${count} nya pass hämtades idag.`,
        url: '/dashboard/passlogg',
      })
    )
  )

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    garmin: { total: garmin.length, ok: garmin.filter(r => r.ok).length, results: garmin },
    concept2: { total: concept2.length, ok: concept2.filter(r => r.ok).length, results: concept2 },
    strava: { total: strava.length, ok: strava.filter(r => r.ok).length, results: strava },
    notified: newPassesByUser.size,
    planReconcile: { usersChecked: planUserIds.length, ...reconciled },
  })
}
