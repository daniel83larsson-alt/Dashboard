import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { generateMonthlyReportForUser } from '@/lib/monthly-report-generate'
import { sendMonthlyReportEmail } from '@/lib/monthly-report-email'

// Admin-only, generate-AND-send in one step (no dashboard "generate" card
// exists yet, unlike Veckans Recap) — Daniel: "vill testa på mig själv
// först" innan detta går till alla ~11 användare. No cron wired up yet;
// see STATUS.md for what's left before a real monthly send exists.
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY saknas i miljövariablerna' }, { status: 500 })
    }
    if (!user.email) return NextResponse.json({ error: 'Kontot saknar e-postadress' }, { status: 400 })

    const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()

    const record = await generateMonthlyReportForUser(supabase, user.id)
    const sent = await sendMonthlyReportEmail({
      toEmail: user.email,
      name: profile?.name ?? user.email.split('@')[0],
      record,
      subjectPrefix: '[TEST] ',
    })
    if (!sent) return NextResponse.json({ error: 'Kunde inte skicka mailet' }, { status: 500 })

    return NextResponse.json({ ok: true, monthLabel: record.data.monthLabel })
  } catch (err) {
    console.error('Monthly report send-test error:', err)
    return NextResponse.json({ error: 'Kunde inte generera eller skicka' }, { status: 500 })
  }
}
