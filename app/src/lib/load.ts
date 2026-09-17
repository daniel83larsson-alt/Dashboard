import { startOfWeek } from './dates'

// Simple heart-rate-reserve-weighted training load — a deliberately
// simplified relative of Banister's TRIMP (duration × %HRR), not the
// gender-calibrated exponential-weighted original, since we don't collect
// sex/age. Good enough for "am I training more or less than usual", not a
// clinically precise absolute number. Passes without HR data still count
// toward volume at a flat moderate-intensity assumption rather than being
// excluded entirely (a synced-but-unworn-strap pass shouldn't vanish).
const NO_HR_INTENSITY = 0.5

export function activityLoad(
  a: { moving_time: number; average_heartrate?: number | null },
  restingHR: number | null,
  maxHR: number | null,
): number {
  const minutes = a.moving_time / 60
  if (a.average_heartrate && restingHR && maxHR && maxHR > restingHR) {
    const hrr = Math.min(1, Math.max(0, (a.average_heartrate - restingHR) / (maxHR - restingHR)))
    return minutes * hrr
  }
  return minutes * NO_HR_INTENSITY
}

function activitiesInWeek<T extends { start_date: string }>(activities: T[], weekStart: Date, weekEnd: Date): T[] {
  return activities.filter(a => {
    const t = new Date(a.start_date).getTime()
    return t >= weekStart.getTime() && t < weekEnd.getTime()
  })
}

export function weeklyLoad(
  activities: { start_date: string; moving_time: number; average_heartrate?: number | null }[],
  restingHR: number | null,
  maxHR: number | null,
  weekStart: Date,
  weekEnd: Date,
): number {
  const inWeek = activitiesInWeek(activities, weekStart, weekEnd)
  return Math.round(inWeek.reduce((s, a) => s + activityLoad(a, restingHR, maxHR), 0))
}

// The actual, literal training time this week — separate from weeklyLoad's
// intensity-weighted score above, which isn't real minutes (a hard, high-
// HR session scores similarly to a much longer easy one). Daniel: "borde
// stå snittid mm, så man kan följa och kanske öka framåt" — an honest,
// directly comparable number to track over time, alongside (not instead
// of) the load percentage.
export function weeklyMinutes(
  activities: { start_date: string; moving_time: number }[],
  weekStart: Date,
  weekEnd: Date,
): number {
  const inWeek = activitiesInWeek(activities, weekStart, weekEnd)
  return Math.round(inWeek.reduce((s, a) => s + a.moving_time, 0) / 60)
}

// Same rolling-baseline idea as rollingBaselineLoad below, for minutes —
// so the UI can show "142 min denna vecka (snitt 118 min)" instead of just
// a bare number with nothing to compare it against.
export function rollingBaselineMinutes(
  activities: { start_date: string; moving_time: number }[],
  now = new Date(),
  weeks = 8,
): number | null {
  const currentWeekStart = startOfWeek(now)
  const totals: number[] = []
  for (let i = 1; i <= weeks; i++) {
    const weekStart = new Date(currentWeekStart)
    weekStart.setDate(weekStart.getDate() - 7 * i)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const minutes = weeklyMinutes(activities, weekStart, weekEnd)
    if (minutes > 0) totals.push(minutes)
  }
  if (!totals.length) return null
  return Math.round(totals.reduce((s, v) => s + v, 0) / totals.length)
}

// Rolling personal baseline (average of the last N fully-completed weeks,
// excluding the current in-progress one) — used as an implicit "goal" when
// the user hasn't set an explicit weekly_load_goal, so the front page has
// something meaningful to compare against without requiring setup.
export function rollingBaselineLoad(
  activities: { start_date: string; moving_time: number; average_heartrate?: number | null }[],
  restingHR: number | null,
  maxHR: number | null,
  now = new Date(),
  weeks = 8,
): number | null {
  const currentWeekStart = startOfWeek(now)
  const totals: number[] = []
  for (let i = 1; i <= weeks; i++) {
    const weekStart = new Date(currentWeekStart)
    weekStart.setDate(weekStart.getDate() - 7 * i)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const load = weeklyLoad(activities, restingHR, maxHR, weekStart, weekEnd)
    if (load > 0) totals.push(load)
  }
  if (!totals.length) return null
  return Math.round(totals.reduce((s, v) => s + v, 0) / totals.length)
}
