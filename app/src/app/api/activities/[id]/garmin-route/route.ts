import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { fetchGarminPolyline } from '@/lib/garmin'
import { decrypt } from '@/lib/encrypt'

// Fetches the full GPS route for one activity on demand (only when the user
// opens that activity's detail page), not during bulk sync — avoids an
// extra Garmin API call per activity on every sync. Result is cached into
// raw_data.polyline so a repeat visit doesn't refetch.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: activity } = await supabase
      .from('activities')
      .select('id, strava_id, raw_data')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (activity.strava_id < 0) return NextResponse.json({ polyline: null }) // Concept2, no GPS

    const raw = (activity.raw_data ?? {}) as Record<string, unknown>
    if (Array.isArray(raw.polyline)) {
      return NextResponse.json({ polyline: raw.polyline })
    }

    const { data: credsRow } = await supabase
      .from('coach_sessions')
      .select('messages')
      .eq('user_id', user.id)
      .eq('coach_id', 'garmin_credentials')
      .single()

    const credsStored = (credsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const userCreds = credsStored ? (() => {
      try {
        const plain = credsStored.length > 100 && !credsStored.startsWith('{') ? decrypt(credsStored) : credsStored
        return JSON.parse(plain)
      } catch { return null }
    })() : null

    if (!userCreds?.email || !userCreds?.password) {
      return NextResponse.json({ polyline: null })
    }

    const polyline = await fetchGarminPolyline(activity.strava_id, userCreds.email, userCreds.password)

    if (polyline) {
      await supabase.from('activities').update({ raw_data: { ...raw, polyline } }).eq('id', id)
    }

    return NextResponse.json({ polyline })
  } catch (err) {
    console.error('Garmin route error:', err)
    return NextResponse.json({ polyline: null })
  }
}
