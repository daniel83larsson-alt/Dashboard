import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Separate from /auth/callback on purpose: that route always redirects
// straight into /dashboard once a code is exchanged, which is right for
// magic links and signup confirmation but wrong here — a password-recovery
// link should land on a form to actually set a new password, not silently
// log the user in with whatever their old (forgotten) password still is.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?resetError=1`)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?resetError=1`)
  }

  return NextResponse.redirect(`${origin}/auth/reset-password/new`)
}
