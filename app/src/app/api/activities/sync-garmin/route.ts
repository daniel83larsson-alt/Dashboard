import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { fetchGarminActivities, garminActivityToRow, fetchGarminRestingHR, fetchGarminSleep } from '@/lib/garmin'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve credentials: user's own first, env vars as fallback
    const { data: credsRow } = await supabase
      .from('coach_sessions')
      .select('messages')
      .eq('user_id', user.id)
      .eq('coach_id', 'garmin_credentials')
      .single()

    const credsRaw = (credsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const userCreds = credsRaw ? (() => { try { return JSON.parse(credsRaw) } catch { return null } })() : null
    const garminEmail = userCreds?.email ?? process.env.GARMIN_EMAIL
    const garminPassword = userCreds?.password ?? process.env.GARMIN_PASSWORD

    if (!garminEmail || !garminPassword) {
      return NextResponse.json({ error: 'Garmin not configured' }, { status: 400 })
    }

    // Fetch Garmin activities + wellness in parallel
    const [garminActivities, restingHR, sleepHours] = await Promise.all([
      fetchGarminActivities(100, garminEmail, garminPassword),
      fetchGarminRestingHR(garminEmail, garminPassword),
      fetchGarminSleep(garminEmail, garminPassword),
    ])

    // Store wellness data for dashboard + coaches
    if (restingHR !== null || sleepHours !== null) {
      await supabase.from('coach_sessions').upsert({
        user_id: user.id,
        coach_id: 'garmin_wellness',
        messages: [{ role: 'system', content: JSON.stringify({ restingHR, sleepHours, updatedAt: new Date().toISOString() }) }],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,coach_id' })
    }

    // Fetch existing activities to detect duplicates
    const oldestGarmin = garminActivities.at(-1)
    const since = oldestGarmin
      ? new Date(oldestGarmin.startTimeLocal).toISOString()
      : new Date(0).toISOString()

    const { data: existing } = await supabase
      .from('activities')
      .select('strava_id, start_date, distance, moving_time, sport_type')
      .eq('user_id', user.id)
      .gte('start_date', since)

    const existingRows = existing ?? []

    const toUpsert = garminActivities
      .map(a => garminActivityToRow(a, user.id))
      .filter(row => {
        // Skip if we already have this exact Garmin activity
        if (existingRows.some(e => e.strava_id === row.strava_id)) return false

        // Skip Rowing activities that duplicate a Concept2 entry
        // Concept2 IDs are stored as negative numbers (r.id * -1)
        const rowDist = row.distance ?? 0
        const rowTime = row.moving_time ?? 0
        if (row.sport_type === 'Rowing' && rowDist > 0 && rowTime > 0) {
          const rowDate = row.start_date.slice(0, 10)
          const duplicate = existingRows.some(e => {
            if (e.strava_id >= 0) return false // not a Concept2 entry
            if (!e.distance || !e.moving_time) return false
            const eDate = e.start_date.slice(0, 10)
            if (eDate !== rowDate) return false
            const distMatch = Math.abs(e.distance - rowDist) / rowDist < 0.05
            const timeMatch = Math.abs(e.moving_time - rowTime) / rowTime < 0.05
            return distMatch && timeMatch
          })
          if (duplicate) return false
        }

        return true
      })

    if (toUpsert.length > 0) {
      await supabase.from('activities').upsert(toUpsert, { onConflict: 'strava_id' })
    }

    return NextResponse.json({
      synced: toUpsert.length,
      wellness: { restingHR, sleepHours },
    })
  } catch (err) {
    console.error('Garmin sync error:', err)
    return NextResponse.json({ error: 'Garmin sync failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ configured: true })
}
