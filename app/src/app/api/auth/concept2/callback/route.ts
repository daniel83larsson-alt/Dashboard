import { NextRequest, NextResponse } from 'next/server'
import { exchangeConcept2Code, fetchConcept2Results, concept2ResultToActivity } from '@/lib/concept2'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieState = request.cookies.get('concept2_state')?.value

  if (!code || state !== cookieState) {
    return NextResponse.redirect(new URL('/dashboard/profil?error=concept2_auth', request.url))
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', request.url))

    const tokens = await exchangeConcept2Code(code)
    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in

    await supabase.from('concept2_tokens').upsert({
      user_id: user.id,
      concept2_user_id: tokens.user_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })

    const results = await fetchConcept2Results(tokens.access_token, tokens.user_id)

    if (results.length > 0) {
      const rows = results.map(r => concept2ResultToActivity(r, user.id))
      await supabase.from('activities').upsert(rows, { onConflict: 'strava_id' })
    }

    const response = NextResponse.redirect(
      new URL(`/dashboard?synced=${results.length}`, request.url)
    )
    response.cookies.delete('concept2_state')
    return response
  } catch (err) {
    console.error('Concept2 OAuth error:', err)
    return NextResponse.redirect(new URL('/dashboard/profil?error=concept2_failed', request.url))
  }
}
