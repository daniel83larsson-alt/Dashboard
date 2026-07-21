import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { recapWeekStart } from '@/lib/weekly-digest'
import { generateWeeklyDigestForUser, type WeeklyDigestRecord } from '@/lib/weekly-digest-generate'
import { sendWeeklyDigestEmail } from '@/lib/weekly-digest-email'
import { sendPushToUser } from '@/lib/push'
import { isDemoAccount } from '@/lib/demo'

export const maxDuration = 60 // Vercel Hobby plan's hard cap

// Only the shared default Gemini key has a real per-minute limit to worry
// about (free tier, ~10 req/min across ALL users combined) — anyone with
// their own key has their own separate quota and doesn't need spacing.
// 6.5s keeps shared-key calls comfortably under that.
const SHARED_KEY_SPACING_MS = 6500

// A single invocation only has ~60s to work with, which real testing showed
// does NOT fit every non-opted-out user once there are more than a handful
// (spacing alone for 13 shared-key users already exceeds it) — confirmed via
// a genuine 504 FUNCTION_INVOCATION_TIMEOUT against production, not a guess.
// Rather than race the clock, this processes a bounded batch and relies on
// "already has this week's digest" as the resume checkpoint: the GitHub
// Actions workflow calls this route several times in a row (see
// dl-trainer-cron.yml), and each call only picks up users who don't have a
// weekly_digest row for the current recap week yet — so re-running is always
// safe and a partial/timed-out run is automatically finished by the next call.
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
  const targetWeekISO = recapWeekStart(new Date()).toISOString().slice(0, 10)

  const { data: allRecipients } = await supabase
    .from('profiles')
    .select('id, email, name, llm_api_key_encrypted')
    .eq('weekly_digest_opt_out', false)
  // The shared demo account must never spend the shared AI quota or get
  // real emails/push — same rule every other AI-consuming route already
  // enforces (isDemoAccount), missed here initially since this is a cron
  // rather than a route triggered by the demo session itself.
  const recipients = (allRecipients ?? []).filter(r => !isDemoAccount(r.email))

  const { data: existingRows } = await supabase
    .from('coach_sessions')
    .select('user_id, messages')
    .eq('coach_id', 'weekly_digest')
    .in('user_id', recipients.map(r => r.id))

  const doneThisWeek = new Set(
    (existingRows ?? [])
      .filter(row => {
        const raw = (row.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
        if (!raw) return false
        try {
          return (JSON.parse(raw) as WeeklyDigestRecord).weekStartISO === targetWeekISO
        } catch {
          return false
        }
      })
      .map(row => row.user_id)
  )

  const pending = recipients.filter(r => !doneThisWeek.has(r.id)).slice(0, BATCH_SIZE)
  const results: { userId: string; ok: boolean; error?: string }[] = []

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i]
    try {
      const record = await generateWeeklyDigestForUser(supabase, r.id)
      await Promise.allSettled([
        r.email
          ? sendWeeklyDigestEmail({ userId: r.id, toEmail: r.email, name: r.name ?? r.email.split('@')[0], record })
          : Promise.resolve(false),
        sendPushToUser(supabase, r.id, {
          title: 'Veckans Recap är redo',
          body: 'Se hur veckan gick och vad som väntar nästa vecka.',
          url: '/dashboard/veckoplan',
        }),
      ])
      results.push({ userId: r.id, ok: true })
    } catch (err) {
      console.error('Weekly digest cron failed for user', r.id, err)
      results.push({ userId: r.id, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    if (!r.llm_api_key_encrypted && i < pending.length - 1) await sleep(SHARED_KEY_SPACING_MS)
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    targetWeek: targetWeekISO,
    totalRecipients: recipients.length,
    alreadyDoneBeforeThisRun: doneThisWeek.size,
    processedThisRun: results.length,
    failedThisRun: results.filter(r => !r.ok).length,
    remainingAfterThisRun: Math.max(0, recipients.length - doneThisWeek.size - results.length),
  })
}
