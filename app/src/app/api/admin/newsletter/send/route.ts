import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { computePersonalStats, renderNewsletterHtml } from '@/lib/newsletter'

type Recipient = { id: string; email: string; name: string | null }
type RawActivity = { user_id: string; id: string; start_date: string; distance: number; moving_time: number; sport_type: string }

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { subject, appNews, testOnly } = await request.json()
  if (!subject?.trim() || !appNews?.trim()) {
    return NextResponse.json({ error: 'Ämne och nyheter krävs' }, { status: 400 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY saknas i miljövariablerna' }, { status: 500 })
  }

  const [{ data: allRecipients, error: recErr }, { data: rawActivities, error: actErr }] = await Promise.all([
    supabase.rpc('admin_newsletter_recipients'),
    supabase.rpc('admin_recent_activities_for_newsletter'),
  ])
  if (recErr || actErr) {
    return NextResponse.json({ error: (recErr ?? actErr)?.message }, { status: 500 })
  }

  // Test-läge: skicka bara till admins egen adress (för att se hur brevet ser
  // ut innan det går ut till riktiga användare) — samma innehåll och samma
  // personliga statistik-beräkning, men aldrig loggat som ett riktigt utskick.
  const recipients = testOnly
    ? (allRecipients ?? []).filter((r: Recipient) => r.email === user.email)
    : (allRecipients ?? [])
  if (testOnly && recipients.length === 0) {
    return NextResponse.json({ error: 'Din adress finns inte i mottagarlistan (avprenumererad?)' }, { status: 400 })
  }

  const activitiesByUser = new Map<string, RawActivity[]>()
  for (const a of (rawActivities ?? []) as RawActivity[]) {
    const list = activitiesByUser.get(a.user_id) ?? []
    list.push(a)
    activitiesByUser.set(a.user_id, list)
  }

  let sentCount = 0
  const failed: string[] = []

  for (const r of recipients as Recipient[]) {
    const stats = computePersonalStats(activitiesByUser.get(r.id) ?? [])
    const html = renderNewsletterHtml({
      name: r.name ?? r.email.split('@')[0],
      appNews: testOnly ? `[TEST — går bara till dig, ingen annan har fått det här]\n\n${appNews}` : appNews,
      stats,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/newsletter/unsubscribe?uid=${r.id}`,
    })

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.NEWSLETTER_FROM_EMAIL ?? 'DL Trainer <onboarding@resend.dev>',
          to: r.email,
          subject: testOnly ? `[TEST] ${subject}` : subject,
          html,
        }),
      })
      if (res.ok) sentCount++
      else failed.push(r.email)
    } catch {
      failed.push(r.email)
    }
  }

  // Testutskick loggas inte som ett riktigt nyhetsbrev-tillfälle — logg­historiken
  // ska bara visa vad som faktiskt gått ut till riktiga användare.
  if (!testOnly) {
    await supabase.from('newsletter_log').insert({ subject, sent_count: sentCount })
  }

  return NextResponse.json({ sentCount, failedCount: failed.length, failed })
}
