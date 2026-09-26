import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { recapMonthStart } from '@/lib/monthly-report'
import { generateMonthlyReportForUser, type MonthlyReportRecord } from '@/lib/monthly-report-generate'
import { sendMonthlyReportEmail } from '@/lib/monthly-report-email'
import { sendPushToUser } from '@/lib/push'
import { isDemoAccount } from '@/lib/demo'

export const maxDuration = 60 // Vercel Hobby plan's hard cap

// Same shared-key spacing/batching/checkpoint design as
// /api/cron/weekly-digest — one Gemini call per user, so the same real
// timeout risk applies once there's more than a handful of users. Safe to
// call repeatedly: a user is only ever picked up while they don't yet have
// a monthly_report row for the target month, so re-running past "everyone's
// done" is a no-op (see dl-trainer-cron.yml, which calls this route
// several times in a row on the 1st, same as it already does for
// weekly-digest).
const SHARED_KEY_SPACING_MS = 6500
const BATCH_SIZE = 5

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const targetMonthISO = recapMonthStart(new Date()).toISOString().slice(0, 10)

  const { data: allRecipients } = await supabase
    .from('profiles')
    .select('id, email, name, llm_api_key_encrypted')
    .eq('monthly_report_opt_out', false)
  // Same rule as every other AI-consuming cron: the shared demo account
  // never spends the shared quota or gets real emails/push.
  const recipients = (allRecipients ?? []).filter(r => !isDemoAccount(r.email))

  const { data: existingRows } = await supabase
    .from('coach_sessions')
    .select('user_id, messages')
    .eq('coach_id', 'monthly_report')
    .in('user_id', recipients.map(r => r.id))

  const doneThisMonth = new Set(
    (existingRows ?? [])
      .filter(row => {
        const raw = (row.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
        if (!raw) return false
        try {
          return (JSON.parse(raw) as MonthlyReportRecord).data.monthStartISO === targetMonthISO
        } catch {
          return false
        }
      })
      .map(row => row.user_id)
  )

  const pending = recipients.filter(r => !doneThisMonth.has(r.id)).slice(0, BATCH_SIZE)
  const results: { userId: string; ok: boolean; error?: string }[] = []

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i]
    try {
      const record = await generateMonthlyReportForUser(supabase, r.id)
      await Promise.allSettled([
        r.email
          ? sendMonthlyReportEmail({ userId: r.id, toEmail: r.email, name: r.name ?? r.email.split('@')[0], record })
          : Promise.resolve(false),
        sendPushToUser(supabase, r.id, {
          title: 'Din månad är redo',
          body: 'Se hur månaden gick — träning, vikt, kost och vanor i en sammanfattning.',
          url: '/dashboard',
        }),
      ])
      results.push({ userId: r.id, ok: true })
    } catch (err) {
      console.error('Monthly report cron failed for user', r.id, err)
      results.push({ userId: r.id, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    if (!r.llm_api_key_encrypted && i < pending.length - 1) await sleep(SHARED_KEY_SPACING_MS)
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    targetMonth: targetMonthISO,
    totalRecipients: recipients.length,
    alreadyDoneBeforeThisRun: doneThisMonth.size,
    processedThisRun: results.length,
    failedThisRun: results.filter(r => !r.ok).length,
    remainingAfterThisRun: Math.max(0, recipients.length - doneThisMonth.size - results.length),
  })
}
