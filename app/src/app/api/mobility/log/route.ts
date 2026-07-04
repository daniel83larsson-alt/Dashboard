import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exerciseNames, movingTime } = await request.json()
  if (!Array.isArray(exerciseNames) || exerciseNames.length === 0) {
    return NextResponse.json({ error: 'Inga övningar angivna' }, { status: 400 })
  }

  const now = new Date()
  const row = {
    user_id: user.id,
    // Manually logged sessions have no external source, so there's no real
    // strava_id to dedupe on — a negative, timestamp-derived id keeps this
    // out of both Concept2's (negative, source-derived) and Garmin's
    // (positive) id space without needing a schema change for a "source"
    // column just for this one feature.
    strava_id: -Date.now(),
    sport_type: 'Mobility',
    name: `Rörlighetspass (${exerciseNames.length} övningar)`,
    distance: 0,
    moving_time: Math.round(movingTime) || 0,
    elapsed_time: Math.round(movingTime) || 0,
    start_date: now.toISOString(),
    description: exerciseNames.join(', '),
  }

  const { error } = await supabase.from('activities').insert(row)
  if (error) {
    console.error('Mobility log error:', error)
    return NextResponse.json({ error: 'Kunde inte spara passet' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
