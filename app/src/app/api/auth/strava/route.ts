import { NextRequest, NextResponse } from 'next/server'
import { exchangeStravaCode, fetchStravaAthlete, fetchStravaActivities, detectSportsFromActivities } from '@/lib/strava'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      new URL('/onboarding?error=strava_denied', request.url)
    )
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const tokens = await exchangeStravaCode(code)
    const athlete = await fetchStravaAthlete(tokens.access_token)

    await supabase.from('strava_tokens').upsert({
      user_id: user.id,
      athlete_id: athlete.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      updated_at: new Date().toISOString(),
    })

    const activities = await fetchStravaActivities(tokens.access_token)
    const sports = detectSportsFromActivities(activities)

    if (activities.length > 0) {
      const rows = activities.map((a: Record<string, unknown>) => ({
        user_id: user.id,
        strava_id: a.id,
        sport_type: a.sport_type,
        name: a.name,
        distance: a.distance,
        moving_time: a.moving_time,
        elapsed_time: a.elapsed_time,
        average_speed: a.average_speed ?? null,
        max_speed: a.max_speed ?? null,
        average_heartrate: a.average_heartrate ?? null,
        max_heartrate: a.max_heartrate ?? null,
        average_watts: a.average_watts ?? null,
        max_watts: a.max_watts ?? null,
        start_date: a.start_date,
        description: a.description ?? null,
        raw_data: a,
      }))
      await supabase.from('activities').upsert(rows, { onConflict: 'user_id,strava_id' })
    }

    const redirectUrl = sports.length > 0
      ? `/onboarding/sports?detected=${sports.join(',')}`
      : '/onboarding/sports'

    return NextResponse.redirect(new URL(redirectUrl, request.url))
  } catch (err) {
    console.error('Strava OAuth error:', err)
    return NextResponse.redirect(
      new URL('/onboarding?error=strava_failed', request.url)
    )
  }
}
