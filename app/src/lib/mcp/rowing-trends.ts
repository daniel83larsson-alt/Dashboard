// Pure: builds get_rowing_trends(weeks)'s JSON payload.
//
// Data-model note (verified before writing this, not assumed): per-split
// data (needed for "pace at a given heart-rate band") only exists on
// Concept2's per-activity detail endpoint, fetched on demand when Daniel
// opens a single activity's page — it is never cached in bulk across many
// sessions at sync time. Computing an HR-banded pace across every rowing
// session in an 8-week window would mean one live Concept2 API call per
// session, which isn't viable here (slow, and risks Concept2's rate
// limits). This tool reports whole-session average pace instead (distance
// / moving_time, already stored on every activity) rather than the
// HR-banded figure the original spec asked for.
//
// Similarly, there's no existing "hard block" / session-intensity concept
// in this codebase (no field marks a session as hard vs easy), so
// hard_blocks_per_week from the original spec is left out rather than
// invented from incomplete HR-zone data.
import { fmtMinSec } from '@/lib/sport'
import type { McpActivity } from './fetch-training-data'
import type { DayWellness } from '@/lib/garmin-sync'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function avgPaceSecPer500m(acts: McpActivity[]): number | null {
  const rowing = acts.filter(a => a.sport_type === 'Rowing' && a.distance > 0)
  const totalDistance = rowing.reduce((s, a) => s + a.distance, 0)
  const totalTime = rowing.reduce((s, a) => s + a.moving_time, 0)
  return totalDistance > 0 ? (totalTime / totalDistance) * 500 : null
}

export type RowingTrends = {
  period_weeks: number
  avg_split_per_500m: string | null
  trend_vs_previous_period: string | null
  weekly_volume_km: number[]
  resting_hr_avg: number | null
}

export function computeRowingTrends(
  activities: McpActivity[],
  wellnessHistory: DayWellness[],
  weeks: number,
  todayKey: string,
): RowingTrends {
  const periodStartKey = addDays(todayKey, -weeks * 7)
  const prevPeriodStartKey = addDays(periodStartKey, -weeks * 7)

  const inPeriod = activities.filter(a => a.start_date.slice(0, 10) >= periodStartKey)
  const inPrevPeriod = activities.filter(a => {
    const d = a.start_date.slice(0, 10)
    return d >= prevPeriodStartKey && d < periodStartKey
  })

  const currentPaceSec = avgPaceSecPer500m(inPeriod)
  const prevPaceSec = avgPaceSecPer500m(inPrevPeriod)
  const trend = currentPaceSec != null && prevPaceSec != null
    ? `${Math.round(currentPaceSec - prevPaceSec) >= 0 ? '+' : ''}${Math.round(currentPaceSec - prevPaceSec)} sek/500m`
    : null

  const weeklyVolumeKm: number[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStartKey = addDays(todayKey, -(i + 1) * 7 + 1)
    const weekEndKey = addDays(weekStartKey, 6)
    const weekDistance = activities
      .filter(a => a.sport_type === 'Rowing' && a.start_date.slice(0, 10) >= weekStartKey && a.start_date.slice(0, 10) <= weekEndKey)
      .reduce((s, a) => s + a.distance, 0)
    weeklyVolumeKm.push(Math.round((weekDistance / 1000) * 10) / 10)
  }

  const restingHrVals = wellnessHistory
    .filter(d => d.date >= periodStartKey && d.date <= todayKey && typeof d.restingHR === 'number')
    .map(d => d.restingHR as number)
  const restingHrAvg = restingHrVals.length ? Math.round((restingHrVals.reduce((s, v) => s + v, 0) / restingHrVals.length) * 10) / 10 : null

  return {
    period_weeks: weeks,
    avg_split_per_500m: currentPaceSec != null ? fmtMinSec(currentPaceSec) : null,
    trend_vs_previous_period: trend,
    weekly_volume_km: weeklyVolumeKm,
    resting_hr_avg: restingHrAvg,
  }
}
