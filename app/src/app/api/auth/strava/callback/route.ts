import { NextRequest, NextResponse } from 'next/server'
import { exchangeStravaCode, fetchStravaActivities, stravaActivityToRow } from '@/lib/strava'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieState = request.cookies.get('strava_state')?.value

  // Strava sends `error=access_denied` (no code) if the athlete declines on
  // Strava's own consent screen — a normal outcome, not a broken flow.
  if (searchParams.get('error')) {
    return NextResponse.redirect(new URL('/dashboard/profil?error=strava_denied', request.url))
  }
  if (!code || state !== cookieState) {
    return NextResponse.redirect(new URL('/dashboard/profil?error=strava_auth', request.url))
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', request.url))

    const tokens = await exchangeStravaCode(code)

    // Refuse to link a Strava account that's already connected to another
    // DL Trainer profile — same guard as Garmin/Concept2, same reason
    // (shared logins are what caused activities to leak between accounts
    // before).
    const { error: claimError } = await supabase.rpc('claim_connected_account', {
      p_provider: 'strava',
      p_external_id: String(tokens.athlete.id),
    })
    if (claimError) {
      const response = NextResponse.redirect(new URL('/dashboard/profil?error=strava_taken', request.url))
      response.cookies.delete('strava_state')
      return response
    }

    await supabase.from('strava_tokens').upsert({
      user_id: user.id,
      athlete_id: tokens.athlete.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      updated_at: new Date().toISOString(),
    })

    const activities = await fetchStravaActivities(tokens.access_token)

    if (activities.length > 0) {
      const rows = activities.map(a => stravaActivityToRow(a, user.id))
      await supabase.from('activities').upsert(rows, { onConflict: 'user_id,strava_id' })
    }

    const response = NextResponse.redirect(
      new URL(`/dashboard?synced=${activities.length}`, request.url)
    )
    response.cookies.delete('strava_state')
    return response
  } catch (err) {
    console.error('Strava OAuth error:', err)
    return NextResponse.redirect(new URL('/dashboard/profil?error=strava_failed', request.url))
  }
}
