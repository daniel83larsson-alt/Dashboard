import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { syncGarminForUser, GarminNotConfiguredError } from '@/lib/garmin-sync'
import { syncConcept2ForUser, Concept2NotConnectedError } from '@/lib/concept2-sync'
import { sendPushToUser } from '@/lib/push'

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

  const [{ data: garminRows }, { data: c2Rows }, { data: authUsers }] = await Promise.all([
    supabase.from('coach_sessions').select('user_id').eq('coach_id', 'garmin_credentials'),
    supabase.from('concept2_tokens').select('user_id'),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailByUserId = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  // Each user's sync hits a different Garmin/Concept2 account, so there's no
  // shared rate limit forcing these to run one at a time — running them in
  // parallel is what keeps the whole job inside Vercel Hobby's 60s cap as
  // the user count grows, instead of stacking each user's sync time.
  const garminSettled = await Promise.allSettled(
    (garminRows ?? []).map(row => syncGarminForUser(supabase, row.user_id, emailByUserId.get(row.user_id)))
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

  // One notification per user summarizing everything the whole run found for
  // them, not one per source — nobody wants two separate pings because they
  // happen to have both Garmin and Concept2 connected.
  const newPassesByUser = new Map<string, number>()
  for (const r of [...garmin, ...concept2]) {
    if (r.ok && r.synced) newPassesByUser.set(r.userId, (newPassesByUser.get(r.userId) ?? 0) + r.synced)
  }
  await Promise.allSettled(
    [...newPassesByUser.entries()].map(([userId, count]) =>
      sendPushToUser(supabase, userId, {
        title: count === 1 ? 'Nytt pass synkat' : `${count} nya pass synkade`,
        body: count === 1 ? 'Ett nytt pass hämtades från Garmin/Concept2 idag.' : `${count} nya pass hämtades från Garmin/Concept2 idag.`,
        url: '/dashboard/passlogg',
      })
    )
  )

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    garmin: { total: garmin.length, ok: garmin.filter(r => r.ok).length, results: garmin },
    concept2: { total: concept2.length, ok: concept2.filter(r => r.ok).length, results: concept2 },
    notified: newPassesByUser.size,
  })
}
