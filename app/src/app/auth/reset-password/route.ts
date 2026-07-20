import { NextRequest, NextResponse } from 'next/server'

// Separate from /auth/callback on purpose: that route always redirects
// straight into /dashboard once a code is exchanged, which is right for
// magic links and signup confirmation but wrong here — a password-recovery
// link should land on a form to actually set a new password, not silently
// log the user in with whatever their old (forgotten) password still is.
//
// Does NOT exchange the code here. Email link-scanners (Outlook Safe Links,
// corporate mail security, some iMessage/SMS preview generators) fetch a
// link with a plain GET to check it before the person ever taps it — if
// that GET burned the one-time reset code, the real click then fails with
// "länken var ogiltig eller har gått ut" even though nothing was wrong.
// The code is passed through untouched; the actual exchange only happens
// in new/page.tsx, triggered by a real form submit, which a passive
// scanner never does.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?resetError=1`)
  }

  return NextResponse.redirect(`${origin}/auth/reset-password/new?code=${encodeURIComponent(code)}`)
}
