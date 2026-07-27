import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { syncStravaForUser, StravaNotConnectedError } from '@/lib/strava-sync'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    logApiCall(supabase, user.id, 'strava_sync')

    const result = await syncStravaForUser(supabase, user.id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof StravaNotConnectedError) {
      return NextResponse.json({ error: 'Strava not connected' }, { status: 400 })
    }
    console.error('Strava sync error:', err)
    return NextResponse.json({ error: 'Strava sync failed' }, { status: 500 })
  }
}
