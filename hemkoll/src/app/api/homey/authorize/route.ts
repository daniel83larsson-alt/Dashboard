import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createHomeyCloudApi } from '@/lib/homey'

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const origin = new URL(request.url).origin
  const redirectUrl = `${origin}/api/homey/callback`

  let loginUrl: string
  try {
    const cloudApi = createHomeyCloudApi(user.id, redirectUrl)
    const state = crypto.randomUUID()
    loginUrl = cloudApi.getLoginUrl({ state })

    const res = NextResponse.redirect(loginUrl)
    res.cookies.set('homey_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Homey är inte konfigurerat i den här miljön' }, { status: 500 })
  }
}
