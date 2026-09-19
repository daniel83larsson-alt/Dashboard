import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { SPORT_LABELS } from '@/lib/sport'
import { estimateCalories, DEFAULT_WEIGHT_KG } from '@/lib/calories'
import { checkAndPushMilestones } from '@/lib/milestones'
import { sanitizeManualExercises } from '@/lib/manual-log'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sportType, movingTime, distance, startDate, name, exercises } = await request.json() as {
    sportType: string
    movingTime: number
    distance: number
    startDate: string
    name?: string
    exercises?: unknown
  }

  if (!SPORT_LABELS[sportType]) return NextResponse.json({ error: 'Okänd träningstyp' }, { status: 400 })
  if (!movingTime || movingTime <= 0) return NextResponse.json({ error: 'Ange en giltig tid' }, { status: 400 })

  // Untrusted client input — sanitized rather than trusted, same spirit as
  // the calorie estimate below never trusting a client-supplied number.
  // Daniel: "skulle vilja ange vikt också... generellt på all typ av
  // träning" — stored structured (not just flattened into `name`) so a
  // future feature (progression per övning) can actually query it.
  const sanitizedExercises = sanitizeManualExercises(exercises)

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
    raw_data: sanitizedExercises.length ? { exercises: sanitizedExercises } : null,
  }

  const { error } = await supabase.from('activities').insert(row)
  if (error) {
    console.error('Manual log error:', error)
    return NextResponse.json({ error: 'Kunde inte spara passet' }, { status: 500 })
  }

  await checkAndPushMilestones(supabase, user.id)

  return NextResponse.json({ ok: true, calories })
}
