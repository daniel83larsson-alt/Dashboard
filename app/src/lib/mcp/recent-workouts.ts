// Pure: builds get_recent_workouts(limit, type)'s JSON payload.
//
// Data-model note (verified before writing this, not assumed): manually
// logged strength/kettlebell sessions have no structured per-exercise
// weight_kg anywhere in this app — LoggaPassForm.tsx only captures
// sets/reps and flattens them into the activity's plain `name` column
// (e.g. "3x10 Svingar, 3x10 Goblet Squat"). There is also no separate
// free-text "notes" column distinct from name/description. So this tool
// returns that name text as-is rather than inventing a structured
// exercises[] array or a notes field the data doesn't actually have.
import { sportLabel, fmtMinSec } from '@/lib/sport'
import type { McpActivity } from './fetch-training-data'

export type RecentWorkout = {
  date: string
  type: string
  duration_min: number
  distance_m: number | null
  avg_split_per_500m: string | null
  avg_hr: number | null
  name: string | null
}

export function computeRecentWorkouts(activities: McpActivity[], limit: number, type: string | null): { workouts: RecentWorkout[] } {
  const typeFilter = type?.trim().toLowerCase() || null
  const matching = typeFilter
    ? activities.filter(a => sportLabel(a.sport_type).toLowerCase() === typeFilter || a.sport_type.toLowerCase() === typeFilter)
    : activities

  // activities arrives sorted oldest-first (fetchMcpActivities) — reverse
  // to most-recent-first before taking the requested count.
  const workouts = [...matching].reverse().slice(0, limit).map((a): RecentWorkout => ({
    date: a.start_date.slice(0, 10),
    type: sportLabel(a.sport_type),
    duration_min: Math.round(a.moving_time / 60),
    distance_m: a.distance > 0 ? Math.round(a.distance) : null,
    avg_split_per_500m: a.sport_type === 'Rowing' && a.distance > 0 ? fmtMinSec((a.moving_time / a.distance) * 500) : null,
    avg_hr: a.average_heartrate ?? null,
    name: a.name ?? null,
  }))

  return { workouts }
}
