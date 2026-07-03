import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createHomeyCloudApi } from '@/lib/homey'

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = request.cookies.get('homey_oauth_state')?.value

  const fail = (reason: string) => {
    const dest = new URL('/dashboard', request.url)
    dest.searchParams.set('homey_error', reason)
    const res = NextResponse.redirect(dest)
    res.cookies.delete('homey_oauth_state')
    return res
  }

  if (!code) return fail('missing_code')
  if (!state || !expectedState || state !== expectedState) return fail('invalid_state')

  const origin = url.origin
  const redirectUrl = `${origin}/api/homey/callback`

  try {
    const cloudApi = createHomeyCloudApi(user.id, redirectUrl)
    await cloudApi.authenticateWithAuthorizationCode({ code })
  } catch (err) {
    console.error('Homey OAuth error:', err)
    return fail('token_exchange_failed')
  }

  const dest = new URL('/dashboard', request.url)
  dest.searchParams.set('homey_connected', '1')
  const res = NextResponse.redirect(dest)
  res.cookies.delete('homey_oauth_state')
  return res
}
