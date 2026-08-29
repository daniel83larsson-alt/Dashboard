import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { sendResetPasswordEmail } from '@/lib/reset-password-email'

// Deliberately unauthenticated — this IS the flow for someone who can't log
// in (see route-invariants.test.ts's allowlist). Always responds the same
// way regardless of whether the email exists, whether sending is
// rate-limited, or whether Resend itself fails — same anti-enumeration
// rule login/page.tsx's forgot-password form already documents, now
// enforced server-side too since this route can be called directly.
const MAX_PER_HOUR = 3
const WINDOW_MS = 60 * 60 * 1000
const GENERIC_MESSAGE = 'Om det finns ett konto med den e-postadressen har vi skickat en länk för att återställa lösenordet.'

export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({ email: undefined }))
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ message: GENERIC_MESSAGE })
  }

  const supabase = createSupabaseAdminClient()

  // Generates the link/token WITHOUT sending anything — Supabase's mailer
  // (and its free-tier-locked template, see reset-password-email.ts for the
  // full story) is never involved. Errors here just mean "no such account"
  // most of the time; swallowed below to keep the response identical
  // either way.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: email.trim(),
  })

  if (error || !data.user) {
    return NextResponse.json({ message: GENERIC_MESSAGE })
  }

  // Reuses the same coach_sessions-as-a-KV-store pattern the rest of the
  // app already uses (see lib/rate-limit.ts for the same idea applied to
  // the shared Gemini key) — a simple fixed window is enough here, this
  // only needs to stop one account's inbox from being bombed, not model a
  // precise rolling limit.
  const { data: row } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', data.user.id)
    .eq('coach_id', 'password_reset_requests')
    .single()
  const stored = (row?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const now = Date.now()
  let state: { windowStart: number; count: number } = { windowStart: now, count: 0 }
  try {
    const parsed = stored ? JSON.parse(stored) : null
    if (parsed && now - parsed.windowStart < WINDOW_MS) state = parsed
  } catch { /* corrupt/missing state — treat as a fresh window */ }

  if (state.count >= MAX_PER_HOUR) {
    return NextResponse.json({ message: GENERIC_MESSAGE })
  }

  await supabase.from('coach_sessions').upsert({
    user_id: data.user.id,
    coach_id: 'password_reset_requests',
    messages: [{ role: 'system', content: JSON.stringify({ windowStart: state.windowStart, count: state.count + 1 }) }],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,coach_id' })

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password/new?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`
  await sendResetPasswordEmail({ toEmail: data.user.email!, resetUrl })

  return NextResponse.json({ message: GENERIC_MESSAGE })
}
