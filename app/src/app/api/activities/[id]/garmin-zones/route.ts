import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { fetchGarminHrZones } from '@/lib/garmin'
import { decrypt } from '@/lib/encrypt'

// Fetches HR-zone breakdown for one activity on demand (only when the user
// opens that activity's detail page), not during bulk sync — avoids an
// extra Garmin API call per activity on every sync. Result is cached into
// raw_data.hrZones so a repeat visit doesn't refetch.
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
    // strava_id is used as a real Garmin activity id below — only safe when
    // source is actually 'garmin'. A Strava row's own (also positive) id
    // would otherwise pass the old sign-only check and get sent to Garmin's
    // API by mistake.
    if (activity.source !== 'garmin') return NextResponse.json({ zones: null })

    const raw = (activity.raw_data ?? {}) as Record<string, unknown>
    if (Array.isArray(raw.hrZones)) {
      return NextResponse.json({ zones: raw.hrZones })
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
      return NextResponse.json({ zones: null })
    }

    const zones = await fetchGarminHrZones(activity.strava_id, userCreds.email, userCreds.password)

    if (zones) {
      await supabase.from('activities').update({ raw_data: { ...raw, hrZones: zones } }).eq('id', id)
    }

    return NextResponse.json({ zones })
  } catch (err) {
    console.error('Garmin HR zones error:', err)
    return NextResponse.json({ zones: null })
  }
}
