import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildTrainingLogText } from '@/lib/training-log-text'

const MAX_WEEKS = 104

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
