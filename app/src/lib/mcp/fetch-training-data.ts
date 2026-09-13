// I/O layer for the training-related MCP tools (adherence, recent workouts,
// rowing trends) — separate from fetch-user-data.ts since these tools need
// activities/goals/milestones instead of food/weight data.
import type { SupabaseClient } from '@supabase/supabase-js'
import { dedupeForStats, type ActivityRow } from '@/lib/duplicates'

export type McpActivity = ActivityRow & {
  calories?: number | null
}

// sinceIso: widest window any caller needs for a single call — same
// "fetch wide, slice per tool" principle fetch-user-data.ts uses.
//
// hr_zones is deliberately NOT selected here — none of these tools report
// zone data, and unlike every other call site in this app it isn't a real
// column (it's the JSON path `raw_data->hrZones`, see lib/duplicates.ts's
// own comment on this). dedupeForStats() treats it as optional and works
// fine without it; selecting the literal (non-existent) column name here
// once made the whole query fail silently — caught via a live curl check
// against Daniel's real rowing history, not by a type error.
export async function fetchMcpActivities(supabase: SupabaseClient, userId: string, sinceIso: string): Promise<McpActivity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('id, strava_id, start_date, distance, moving_time, sport_type, name, average_heartrate, source, calories')
    .eq('user_id', userId)
    .gte('start_date', sinceIso)
    .order('start_date', { ascending: true })
  if (error) {
    console.error('fetchMcpActivities error:', error)
    return []
  }
  return dedupeForStats((data ?? []) as McpActivity[])
}

export type McpStrengthGoal = { sportType: string; sessionsPerWeek: number }

// Only a structured, currently-active goal counts as a "target" — a
// freeform goals.description with no sessions_per_week is real intent but
// not a number this tool can compare against, so it's left out rather than
// guessed at.
export async function fetchMcpStrengthGoal(supabase: SupabaseClient, userId: string): Promise<McpStrengthGoal | null> {
  const { data } = await supabase
    .from('goals')
    .select('sport_type, sessions_per_week')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('sport_type', ['Kettlebell', 'WeightTraining'])
    .not('sessions_per_week', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { sportType: data.sport_type as string, sessionsPerWeek: data.sessions_per_week as number } : null
}
