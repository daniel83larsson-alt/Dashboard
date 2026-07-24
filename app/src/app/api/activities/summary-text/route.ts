import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildTrainingLogText } from '@/lib/training-log-text'

// A generous ceiling, not a real limit — just guards against a garbage
// query param. Real activity history can run back several years (accounts
// synced before the 1-year Garmin-backfill cap was added keep their older
// data), so this needs to comfortably exceed that, not just "a year or two".
const MAX_WEEKS = 520

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const weeksParam = parseInt(request.nextUrl.searchParams.get('weeks') ?? '', 10)
  const weeks = Math.min(MAX_WEEKS, Math.max(1, Number.isFinite(weeksParam) ? weeksParam : 12))

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, strava_id, sport_type, name, distance, moving_time, start_date')
    .eq('user_id', user.id)
    .order('start_date', { ascending: true })

  if (error) return NextResponse.json({ error: 'Kunde inte hämta aktiviteter' }, { status: 500 })

  const text = buildTrainingLogText(activities ?? [], weeks)
  return NextResponse.json({ text })
}
