import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { SPORT_LABELS } from '@/lib/sport'
import { estimateCalories, DEFAULT_WEIGHT_KG } from '@/lib/calories'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sportType, movingTime, distance, startDate, name } = await request.json() as {
    sportType: string
    movingTime: number
    distance: number
    startDate: string
    name?: string
  }

  if (!SPORT_LABELS[sportType]) return NextResponse.json({ error: 'Okänd träningstyp' }, { status: 400 })
  if (!movingTime || movingTime <= 0) return NextResponse.json({ error: 'Ange en giltig tid' }, { status: 400 })

  const parsedDate = startDate ? new Date(startDate) : new Date()
  if (Number.isNaN(parsedDate.getTime())) return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('weight_kg').eq('id', user.id).single()
  // Calories are always computed server-side from the user's own saved
  // weight — never trusted from the client — so a manipulated request can't
  // write an arbitrary calorie count.
  const weightKg = profile?.weight_kg ?? DEFAULT_WEIGHT_KG
  const calories = estimateCalories(sportType, movingTime, weightKg)

  const row = {
    user_id: user.id,
    // Manually logged sessions have no external source, so there's no real
    // strava_id to dedupe on — same negative-timestamp convention already
    // used by the mobility logger.
    strava_id: -Date.now(),
    source: 'manual',
    sport_type: sportType,
    // An optional exercise summary (e.g. "5x10 Clean and Press") from the
    // kettlebell picker overrides the generic sport-label name — capped and
    // trimmed since it's free text from the client.
    name: name?.trim()
      ? name.trim().slice(0, 200)
      : (SPORT_LABELS[sportType] ? `${SPORT_LABELS[sportType][0].toUpperCase()}${SPORT_LABELS[sportType].slice(1)}` : sportType),
    distance: Math.max(0, distance || 0),
    moving_time: Math.round(movingTime),
    elapsed_time: Math.round(movingTime),
    calories,
    start_date: parsedDate.toISOString(),
  }

  const { error } = await supabase.from('activities').insert(row)
  if (error) {
    console.error('Manual log error:', error)
    return NextResponse.json({ error: 'Kunde inte spara passet' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, calories })
}
