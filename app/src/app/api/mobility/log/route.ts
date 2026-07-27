import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { REGION_LABELS, Region } from '@/lib/mobility'

type LoggedExercise = { id: string; name: string; region: Region; dose: string }

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exercises, movingTime } = await request.json() as { exercises: LoggedExercise[]; movingTime: number }
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return NextResponse.json({ error: 'Inga övningar angivna' }, { status: 400 })
  }

  const regions = [...new Set(exercises.map(e => e.region))]
  const now = new Date()
  const row = {
    user_id: user.id,
    // Manually logged sessions have no external source, so there's no real
    // strava_id to dedupe on — a negative, timestamp-derived id keeps this
    // out of both Concept2's (negative, source-derived) and Garmin's
    // (positive) id space without needing a schema change for a "source"
    // column just for this one feature.
    strava_id: -Date.now(),
    source: 'manual',
    sport_type: 'Mobility',
    name: `Rörlighetspass (${regions.map(r => REGION_LABELS[r]).join(', ')})`,
    distance: 0,
    moving_time: Math.round(movingTime) || 0,
    elapsed_time: Math.round(movingTime) || 0,
    start_date: now.toISOString(),
    description: exercises.map(e => e.name).join(', '),
    // Structured so the pass-detail page can render an actual checklist of
    // what was done, not just a comma-joined description string.
    raw_data: { exercises },
  }

  const { error } = await supabase.from('activities').insert(row)
  if (error) {
    console.error('Mobility log error:', error)
    return NextResponse.json({ error: 'Kunde inte spara passet' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
