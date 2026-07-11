import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { syncGarminForUser, GarminNotConfiguredError } from '@/lib/garmin-sync'
import { syncConcept2ForUser, Concept2NotConnectedError } from '@/lib/concept2-sync'

export const maxDuration = 300 // Vercel cron allows longer than the default 10s — one run covers every connected user

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

  const garmin: Array<{ userId: string; ok: boolean; error?: string; synced?: number }> = []
  for (const row of garminRows ?? []) {
    try {
      const result = await syncGarminForUser(supabase, row.user_id, emailByUserId.get(row.user_id))
      garmin.push({ userId: row.user_id, ok: true, synced: result.synced })
    } catch (err) {
      // A not-configured/expired-login failure for one user must never stop
      // the rest of the run — each user's sync is fully independent.
      const isConfigError = err instanceof GarminNotConfiguredError
      garmin.push({ userId: row.user_id, ok: false, error: isConfigError ? 'not_configured' : (err instanceof Error ? err.message : String(err)) })
    }
  }

  const concept2: Array<{ userId: string; ok: boolean; error?: string; synced?: number }> = []
  for (const row of c2Rows ?? []) {
    try {
      const result = await syncConcept2ForUser(supabase, row.user_id)
      concept2.push({ userId: row.user_id, ok: true, synced: result.synced })
    } catch (err) {
      const isConfigError = err instanceof Concept2NotConnectedError
      concept2.push({ userId: row.user_id, ok: false, error: isConfigError ? 'not_connected' : (err instanceof Error ? err.message : String(err)) })
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    garmin: { total: garmin.length, ok: garmin.filter(r => r.ok).length, results: garmin },
    concept2: { total: concept2.length, ok: concept2.filter(r => r.ok).length, results: concept2 },
  })
}
