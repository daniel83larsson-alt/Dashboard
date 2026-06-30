import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { fetchGarminActivities, garminActivityToRow } from '@/lib/garmin'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      return NextResponse.json({ error: 'Garmin not configured' }, { status: 400 })
    }

    const { data: latest } = await supabase
      .from('activities')
      .select('start_date')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .limit(1)
      .single()

    const activities = await fetchGarminActivities(100)

    const cutoff = latest?.start_date
      ? new Date(new Date(latest.start_date).getTime() - 86400000)
      : new Date(0)

    const toUpsert = activities
      .filter(a => new Date(a.startTimeLocal) >= cutoff)
      .map(a => garminActivityToRow(a, user.id))

    if (toUpsert.length > 0) {
      await supabase.from('activities').upsert(toUpsert, { onConflict: 'strava_id' })
    }

    return NextResponse.json({ synced: toUpsert.length })
  } catch (err) {
    console.error('Garmin sync error:', err)
    return NextResponse.json({ error: 'Garmin sync failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    configured: !!(process.env.GARMIN_EMAIL && process.env.GARMIN_PASSWORD),
  })
}
