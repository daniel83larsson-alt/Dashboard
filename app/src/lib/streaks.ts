import { startOfWeek } from './dates'

const DAY_MS = 86400000

function toDayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Current streak = consecutive days up to and including the most recent
// trained day, but only "alive" if that day was today or yesterday — two or
// more days of silence resets it to 0 rather than showing a stale number.
export function currentDailyStreak(activities: { start_date: string }[], now = new Date()): number {
  const days = [...new Set(activities.map(a => toDayKey(new Date(a.start_date))))].sort().reverse()
  if (!days.length) return 0

  const todayKey = toDayKey(now)
  const mostRecent = new Date(days[0])
  const daysSinceMostRecent = Math.round((new Date(todayKey).getTime() - mostRecent.getTime()) / DAY_MS)
  if (daysSinceMostRecent > 1) return 0

  let streak = 1
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i - 1]).getTime() - new Date(days[i]).getTime()) / DAY_MS)
    if (diff === 1) streak++
    else break
  }
  return streak
}

// Same idea, one week at a time (Monday-start weeks) — a week counts if it
// has at least one activity anywhere in it. The current week always keeps
// the streak alive (even with zero activities so far), same grace as the
// daily version; only a fully-skipped previous week breaks it.
export function currentWeeklyStreak(activities: { start_date: string }[], now = new Date()): number {
  const weekStarts = [...new Set(activities.map(a => toDayKey(startOfWeek(new Date(a.start_date)))))].sort().reverse()
  if (!weekStarts.length) return 0

  const currentWeekKey = toDayKey(startOfWeek(now))
  const mostRecent = new Date(weekStarts[0])
  const weeksSinceMostRecent = Math.round((new Date(currentWeekKey).getTime() - mostRecent.getTime()) / (DAY_MS * 7))
  if (weeksSinceMostRecent > 1) return 0

  let streak = 1
  for (let i = 1; i < weekStarts.length; i++) {
    const diff = Math.round((new Date(weekStarts[i - 1]).getTime() - new Date(weekStarts[i]).getTime()) / (DAY_MS * 7))
    if (diff === 1) streak++
    else break
  }
  return streak
}

// Consecutive days where recorded steps met the user's goal, walking back
// from the most recent day with wellness data. Stale sync (no data for 2+
// days) reads as 0 rather than a frozen, misleading number.
export function currentStepGoalStreak(history: { date: string; steps: number | null }[], goal: number, now = new Date()): number {
  const withSteps = history.filter(h => h.steps != null)
  if (!withSteps.length || !goal) return 0

  const todayKey = toDayKey(now)
  const mostRecentKey = withSteps[0].date.slice(0, 10)
  const daysSinceMostRecent = Math.round((new Date(todayKey).getTime() - new Date(mostRecentKey).getTime()) / DAY_MS)
  if (daysSinceMostRecent > 1) return 0

  if ((withSteps[0].steps ?? 0) < goal) return 0

  let streak = 1
  for (let i = 1; i < withSteps.length; i++) {
    const prevKey = withSteps[i - 1].date.slice(0, 10)
    const curKey = withSteps[i].date.slice(0, 10)
    const diff = Math.round((new Date(prevKey).getTime() - new Date(curKey).getTime()) / DAY_MS)
    if (diff === 1 && (withSteps[i].steps ?? 0) >= goal) streak++
    else break
  }
  return streak
}
