// Isolates "how much is my training actually contributing to TDEE" as its
// own trend, separate from the BMR/weight-driven side — Daniel: "kunde
// jag se TDEE grundande från träning... är ju intressant om den skulle
// droppa, motverkar ju att jag äter lite." A dropping TDEE could mean
// "I lost weight" (fine) or "I've been training less" (worth knowing) —
// this isolates the second cause so it's never hidden behind the first.
// Pure computation, no I/O — same contract as lib/deficit.ts.
import { dedupeForStats, type ActivityRow } from './duplicates'
import { daysWithRealTrainingCalories } from './deficit'
import { TRAINING_LOOKBACK_DAYS, MIN_TRAINING_HISTORY_DAYS } from './deficit-budget-refreeze'

export type TrainingKcalTrendPoint = {
  weekEndDateKey: string // YYYY-MM-DD, Stockholm-agnostic (calendar date only — a weekly trend doesn't need day-boundary precision)
  // TDEE's training contribution as of that week — trainingKcal (28-day
  // rolling average) × garminCorrection, same formula computeDeficitBudget
  // itself uses. Null when fewer than MIN_TRAINING_HISTORY_DAYS days of
  // REAL calorie data existed in that window — an honest gap, never a
  // guessed/flat-lined value (same rule daysWithRealTrainingCalories
  // exists to protect elsewhere).
  correctedTrainingKcalPerDay: number | null
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// activities should cover at least (weeks * 7 + TRAINING_LOOKBACK_DAYS)
// days back from `now` — the caller fetches once, this dedupes once, then
// slices a rolling 28-day window per week point.
export function computeTrainingKcalTrend(
  activities: (ActivityRow & { calories?: number | null })[],
  garminCorrection: number,
  now: Date,
  weeks = 12
): TrainingKcalTrendPoint[] {
  const deduped = dedupeForStats(activities)

  const points: TrainingKcalTrendPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() - i * 7)
    const windowStart = new Date(weekEnd)
    windowStart.setDate(windowStart.getDate() - (TRAINING_LOOKBACK_DAYS - 1))

    const inWindow = deduped.filter(a => {
      const t = new Date(a.start_date).getTime()
      return t >= windowStart.getTime() && t <= weekEnd.getTime()
    })

    const realDays = daysWithRealTrainingCalories(inWindow)
    const correctedTrainingKcalPerDay = realDays >= MIN_TRAINING_HISTORY_DAYS
      ? Math.round((inWindow.reduce((s, a) => s + (a.calories ?? 0), 0) / TRAINING_LOOKBACK_DAYS) * garminCorrection)
      : null

    points.push({ weekEndDateKey: toDateKey(weekEnd), correctedTrainingKcalPerDay })
  }
  return points
}
