import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { recapWeekStart } from '@/lib/weekly-digest'
import { recapMonthStart } from '@/lib/monthly-report'
import { sendPushToUser } from '@/lib/push'
import { isDemoAccount } from '@/lib/demo'

export const maxDuration = 60

// Daglig kontroll av att det som SKA ha hänt har hänt. pg_cron säger "lyckades"
// så snart ett anrop köats — det betyder inte att appen utförde jobbet. Den här
// rutten tittar på resultatet (finns veckorecap/månadsrapport för alla som ska
// ha dem, har någon pg_cron-körning misslyckats, har pushar misslyckats) och
// larmar Discord + Daniel bara när något är fel. Auth: CRON_SECRET eller
// SCHEDULER_SECRET (se lib/cron-auth.ts).

type Problem = { check: string; detail: string }

async function alertDiscord(problems: Problem[]) {
  const url = process.env.SIGNUP_NOTIFY_WEBHOOK_URL
  if (!url) return
  const content = `⚠️ **Schemaläggningskontroll**\n${problems.map(p => `- ${p.check}: ${p.detail}`).join('\n')}`
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }).catch(() => {})
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseAdminClient()
  const now = new Date()
  const problems: Problem[] = []

  // 1) pg_cron: misslyckade körningar och avstängda jobb
  const { data: snap, error: snapErr } = await supabase.rpc('cron_health_snapshot')
  if (snapErr) problems.push({ check: 'pg_cron', detail: `kunde inte läsa status: ${snapErr.message}` })
  else {
    const failed = (snap?.failed_runs ?? []) as { job: string; status: string }[]
    if (failed.length) problems.push({ check: 'pg_cron', detail: `${failed.length} misslyckade körningar senaste dygnet (${[...new Set(failed.map(f => f.job))].join(', ')})` })
    const inactive = (snap?.inactive_jobs ?? []) as string[]
    if (inactive.length) problems.push({ check: 'pg_cron', detail: `avstängda jobb: ${inactive.join(', ')}` })
  }

  // 2) Veckorecap: efter söndag 20:00 UTC ska alla som inte valt bort den ha en post för recap-veckan
  const weekStart = recapWeekStart(now)
  const weekDue = new Date(weekStart); weekDue.setDate(weekDue.getDate() + 6); weekDue.setUTCHours(20, 0, 0, 0)
  if (now > weekDue) {
    const missing = await countMissing(supabase, 'weekly_digest', 'weekly_digest_opt_out', weekStart.toISOString().slice(0, 10), rec => (rec as { weekStartISO?: string }).weekStartISO)
    if (missing > 0) problems.push({ check: 'veckorecap', detail: `${missing} användare saknar recap för veckan som började ${weekStart.toISOString().slice(0, 10)}` })
  }

  // 3) Månadsrapport: efter den 1:a 08:00 UTC ska alla ha rapporten för förra månaden
  const monthStart = recapMonthStart(now)
  const monthDue = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 8, 0, 0))
  if (now > monthDue) {
    const key = monthStart.toISOString().slice(0, 10)
    const missing = await countMissing(supabase, 'monthly_report', 'monthly_report_opt_out', key, rec => (rec as { data?: { monthStartISO?: string } }).data?.monthStartISO)
    if (missing > 0) problems.push({ check: 'månadsrapport', detail: `${missing} användare saknar rapport för månaden som började ${key}` })
  }

  // 4) Push: prenumerationer som misslyckats senaste dygnet utan efterföljande lyckad leverans
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const { data: bad } = await supabase.from('push_subscriptions')
    .select('last_error_status, last_error_at, last_success_at').gte('last_error_at', since)
  const stuck = (bad ?? []).filter(s => !s.last_success_at || (s.last_error_at && s.last_success_at < s.last_error_at))
  if (stuck.length) {
    const codes = [...new Set(stuck.map(s => String(s.last_error_status ?? 'okänt')))].join(', ')
    problems.push({ check: 'push', detail: `${stuck.length} prenumerationer får fel (${codes})` })
  }

  if (problems.length) {
    await alertDiscord(problems)
    const adminEmail = process.env.ADMIN_EMAIL
    if (adminEmail && !isDemoAccount(adminEmail)) {
      const { data: admin } = await supabase.from('profiles').select('id').eq('email', adminEmail).maybeSingle()
      if (admin) {
        await sendPushToUser(supabase, admin.id, {
          title: 'Schemaläggning: något har inte gått',
          body: problems.map(p => p.check).join(', '),
          url: '/dashboard/admin',
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ ranAt: now.toISOString(), ok: problems.length === 0, problems })
}

// Antal mottagare (ej bortvalda, ej demo) som saknar en post för perioden.
async function countMissing(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  coachId: 'weekly_digest' | 'monthly_report',
  optOutColumn: string,
  periodKey: string,
  periodOf: (rec: unknown) => string | undefined,
): Promise<number> {
  const { data: all } = await supabase.from('profiles').select('id, email').eq(optOutColumn, false)
  const recipients = (all ?? []).filter(r => !isDemoAccount(r.email))
  if (!recipients.length) return 0
  const { data: rows } = await supabase.from('coach_sessions').select('user_id, messages').eq('coach_id', coachId).in('user_id', recipients.map(r => r.id))
  const done = new Set((rows ?? []).filter(row => {
    const raw = (row.messages as Array<{ content: string }> | null)?.[0]?.content
    if (!raw) return false
    try { return periodOf(JSON.parse(raw)) === periodKey } catch { return false }
  }).map(r => r.user_id))
  return recipients.filter(r => !done.has(r.id)).length
}
