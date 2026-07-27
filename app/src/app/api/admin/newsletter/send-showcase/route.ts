import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { renderFeatureShowcaseHtml } from '@/lib/feature-showcase-email'

type Recipient = { id: string; email: string; name: string | null }

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY saknas i miljövariablerna' }, { status: 500 })
  }

  const { testOnly } = await request.json()

  const { data: allRecipients, error: recErr } = await supabase.rpc('admin_newsletter_recipients')
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  // Samma test-läge som det vanliga nyhetsbrevet: skickar bara till admins
  // egen adress, loggas aldrig som ett riktigt utskick.
  const recipients = testOnly
    ? (allRecipients ?? []).filter((r: Recipient) => r.email === user.email)
    : (allRecipients ?? [])
  if (testOnly && recipients.length === 0) {
    return NextResponse.json({ error: 'Din adress finns inte i mottagarlistan (avprenumererad?)' }, { status: 400 })
  }

  let sentCount = 0
  const failed: string[] = []

  for (const r of recipients as Recipient[]) {
    const html = renderFeatureShowcaseHtml({
      name: r.name ?? r.email.split('@')[0],
      wrongVersionNote: true,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/newsletter/unsubscribe?uid=${r.id}`,
    })

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.NEWSLETTER_FROM_EMAIL ?? 'DL Trainer <onboarding@resend.dev>',
          to: r.email,
          subject: testOnly ? '[TEST] Vad är nytt i DL Trainer' : 'Vad är nytt i DL Trainer',
          html,
        }),
      })
      if (res.ok) sentCount++
      else failed.push(r.email)
    } catch {
      failed.push(r.email)
    }
  }

  if (!testOnly) {
    await supabase.from('newsletter_log').insert({ subject: 'Vad är nytt i DL Trainer (funktionsmejl)', sent_count: sentCount })
  }

  return NextResponse.json({ sentCount, failedCount: failed.length, failed })
}
