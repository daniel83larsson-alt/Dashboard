import { NextRequest, NextResponse } from 'next/server'

// Receives a Supabase Database Webhook fired on INSERT into public.profiles
// (i.e. every new signup, via the existing handle_new_user trigger) and
// relays a formatted message to a Discord/Slack incoming-webhook URL.
// Both accept the same {"content": "..."} JSON shape.
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  if (!process.env.SIGNUP_WEBHOOK_SECRET || secret !== process.env.SIGNUP_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const notifyUrl = process.env.SIGNUP_NOTIFY_WEBHOOK_URL
  if (!notifyUrl) {
    return NextResponse.json({ error: 'Not configured' }, { status: 200 })
  }

  try {
    const payload = await request.json()
    const record = payload?.record ?? {}
    const email = record.email ?? 'okänd e-post'
    const name = record.name ?? null
    const when = record.created_at ?? new Date().toISOString()

    const content = `🎉 Ny användare registrerad på DL Trainer\n**${name ?? email}**${name ? ` (${email})` : ''}\n${new Date(when).toLocaleString('sv-SE')}`

    await fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Signup webhook relay error:', err)
    return NextResponse.json({ error: 'Relay failed' }, { status: 500 })
  }
}
