import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { sendWeeklyDigestEmail } from '@/lib/weekly-digest-email'
import type { WeeklyDigestRecord } from '@/lib/weekly-digest-generate'

// Emails the user's own most-recently-GENERATED digest to themselves —
// lets them preview the email before Sunday's cron (step 4) exists, and
// stays useful afterward as a manual "send me a copy now". Requires a
// digest to already be generated (via the Veckoplan card) — this route
// only sends, it never triggers generation itself, so the AI cost of a
// preview is never duplicated.
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY saknas i miljövariablerna' }, { status: 500 })
    if (!user.email) return NextResponse.json({ error: 'Kontot saknar e-postadress' }, { status: 400 })

    const [{ data: profile }, { data: digestRow }] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', user.id).single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'weekly_digest').maybeSingle(),
    ])

    const raw = (digestRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const record: WeeklyDigestRecord | null = raw ? (() => { try { return JSON.parse(raw) } catch { return null } })() : null
    if (!record) return NextResponse.json({ error: 'Generera veckans recap innan du skickar ett testmail.' }, { status: 400 })

    const sent = await sendWeeklyDigestEmail({
      userId: user.id,
      toEmail: user.email,
      name: profile?.name ?? user.email.split('@')[0],
      record,
      subjectPrefix: '[TEST] ',
    })
    if (!sent) return NextResponse.json({ error: 'Kunde inte skicka mailet' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Weekly digest send-test error:', err)
    return NextResponse.json({ error: 'Kunde inte skicka testmail' }, { status: 500 })
  }
}
