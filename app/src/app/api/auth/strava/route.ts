import { NextRequest, NextResponse } from 'next/server'
import { getStravaAuthUrl } from '@/lib/strava'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { randomBytes } from 'crypto'
import { isDemoAccount } from '@/lib/demo'

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  if (isDemoAccount(user.email)) return NextResponse.redirect(new URL('/dashboard/profil?error=demo_blocked', request.url))

  const state = randomBytes(16).toString('hex')
  const url = getStravaAuthUrl(state)

  const response = NextResponse.redirect(url)
  response.cookies.set('strava_state', state, { httpOnly: true, maxAge: 600 })
  return response
}
