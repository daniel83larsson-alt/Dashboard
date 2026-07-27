import { NextRequest, NextResponse } from 'next/server'
import { exchangePolarCode, registerPolarUser, fetchPolarExercises, polarExerciseToRow } from '@/lib/polar'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieState = request.cookies.get('polar_state')?.value

  if (searchParams.get('error')) {
    return NextResponse.redirect(new URL('/dashboard/profil?error=polar_denied', request.url))
  }
  if (!code || state !== cookieState) {
    return NextResponse.redirect(new URL('/dashboard/profil?error=polar_auth', request.url))
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', request.url))

    const tokens = await exchangePolarCode(code)

    // Refuse to link a Polar account that's already connected to another
    // DL Trainer profile — same guard as Garmin/Concept2/Strava.
    const { error: claimError } = await supabase.rpc('claim_connected_account', {
      p_provider: 'polar',
      p_external_id: String(tokens.x_user_id),
    })
    if (claimError) {
      const response = NextResponse.redirect(new URL('/dashboard/profil?error=polar_taken', request.url))
      response.cookies.delete('polar_state')
      return response
    }

    // Polar-specific extra step — the OAuth token alone isn't usable against
    // any data endpoint until the athlete is registered with our member-id.
    await registerPolarUser(tokens.access_token, user.id)

    await supabase.from('polar_tokens').upsert({
      user_id: user.id,
      polar_user_id: tokens.x_user_id,
      access_token: tokens.access_token,
      updated_at: new Date().toISOString(),
    })

    const exercises = await fetchPolarExercises(tokens.access_token, tokens.x_user_id)

    if (exercises.length > 0) {
      const rows = exercises.map(e => polarExerciseToRow(e, user.id))
      await supabase.from('activities').upsert(rows, { onConflict: 'user_id,strava_id' })
    }

    const response = NextResponse.redirect(
      new URL(`/dashboard?synced=${exercises.length}`, request.url)
    )
    response.cookies.delete('polar_state')
    return response
  } catch (err) {
    console.error('Polar OAuth error:', err)
    return NextResponse.redirect(new URL('/dashboard/profil?error=polar_failed', request.url))
  }
}
