import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { fetchConcept2ResultDetail, refreshConcept2Token } from '@/lib/concept2'

// Fetches the full single-result detail from Concept2 (splits/intervals the
// list endpoint may omit) on demand when viewing that activity, caching
// into raw_data so a repeat visit doesn't refetch.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: activity } = await supabase
      .from('activities')
      .select('id, strava_id, source, raw_data')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // strava_id×-1 is used as a real Concept2 result id below — only safe
    // when source is actually 'concept2' (a manual/mobility row's
    // -Date.now() id would otherwise pass the old sign-only check).
    if (activity.source !== 'concept2') return NextResponse.json({ detail: null })

    const raw = (activity.raw_data ?? {}) as Record<string, unknown>
    const cachedWorkout = raw.workout as { splits?: unknown[] } | undefined
    if (Array.isArray(cachedWorkout?.splits) && cachedWorkout.splits.length > 0) {
      return NextResponse.json({ detail: raw })
    }

    const { data: tokenRow } = await supabase
      .from('concept2_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!tokenRow) return NextResponse.json({ detail: null })

    let accessToken = tokenRow.access_token
    const now = Math.floor(Date.now() / 1000)
    if (tokenRow.refresh_token !== 'personal_token' && tokenRow.expires_at < now + 60) {
      const refreshed = await refreshConcept2Token(tokenRow.refresh_token)
      accessToken = refreshed.access_token
      await supabase.from('concept2_tokens').update({
        access_token: refreshed.access_token,
        expires_at: now + refreshed.expires_in,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id)
    }

    const resultId = activity.strava_id * -1
    const detail = await fetchConcept2ResultDetail(accessToken, tokenRow.concept2_user_id, resultId)

    if (detail) {
      await supabase.from('activities').update({ raw_data: detail }).eq('id', id)
    }

    return NextResponse.json({ detail })
  } catch (err) {
    console.error('Concept2 detail error:', err)
    return NextResponse.json({ detail: null })
  }
}
