import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { generateWeeklyDigestForUser } from '@/lib/weekly-digest-generate'
import { sendWeeklyDigestEmail } from '@/lib/weekly-digest-email'
import { sendPushToUser } from '@/lib/push'

export const maxDuration = 60 // Vercel Hobby plan's hard cap

// Only the shared default Gemini key has a real per-minute limit to worry
// about (free tier, ~10 req/min across ALL users combined) — anyone with
// their own key has their own separate quota and doesn't need spacing.
// 6.5s keeps shared-key calls comfortably under that. At today's user count
// this fits well inside maxDuration; if the shared-key user count grows
// enough to threaten the 60s cap, batch this cron the same way sync-all's
// own comment already flags for its Garmin lock.
const SHARED_KEY_SPACING_MS = 6500

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Runs Sunday evening (see .github/workflows/dl-trainer-cron.yml) — generates
// and sends "Veckans Recap" for every user who hasn't opted out. Sequential
// rather than Promise.allSettled-parallel like the other cron jobs, because
// shared-key users need real spacing between Gemini calls; each user's
// generate+email+push is still wrapped so one person's failure (AI or
// otherwise) never stops the rest of the run.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  const { data: recipients } = await supabase
    .from('profiles')
    .select('id, email, name, llm_api_key_encrypted')
    .eq('weekly_digest_opt_out', false)

  const rows = recipients ?? []
  const results: { userId: string; ok: boolean; error?: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
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
    if (!r.llm_api_key_encrypted && i < rows.length - 1) await sleep(SHARED_KEY_SPACING_MS)
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    processed: results.length,
    failed: results.filter(r => !r.ok).length,
  })
}
