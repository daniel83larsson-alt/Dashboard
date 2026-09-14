// Isolates "how much is my training actually contributing to TDEE" as its
// own trend, separate from the BMR/weight-driven side — Daniel: "kunde
// jag se TDEE grundande från träning... är ju intressant om den skulle
// droppa, motverkar ju att jag äter lite." A dropping TDEE could mean
// "I lost weight" (fine) or "I've been training less" (worth knowing) —
// this isolates the second cause so it's never hidden behind the first.
// Pure computation, no I/O — same contract as lib/deficit.ts.
import { dedupeForStats, type ActivityRow } from './duplicates'
import { daysWithRealTrainingCalories } from './deficit'

// Deliberately a SEPARATE, shorter window than the budget's own 28-day
// average (deficit-budget-refreeze.ts's TRAINING_LOOKBACK_DAYS, untouched
// by this file) — Daniel: "7 dagar så är det i veckan... är man sjuk går
// den ner, sen när man blir frisk ökar man." The budget deliberately wants
// a smoothed, stable number; THIS chart's whole job is to show that
// weekly rise-and-fall responsively, so a 28-day smoothing would work
// against the point of looking at it.
export const CHART_WINDOW_DAYS = 7
// Not a blind copy of the budget's 14-of-28 (50%) ratio — a 7-day window
// has so few days that requiring 4 (57%) made almost every normal
// every-other-day training week come back null for Daniel's real
// cadence. 3 of 7 (~43%) still refuses to average a near-empty week, just
// slightly more lenient to fit a week-sized window.
const MIN_REAL_DAYS_FOR_CHART = 3

export type TrainingKcalTrendPoint = {
  weekEndDateKey: string // YYYY-MM-DD, Stockholm-agnostic (calendar date only — a weekly trend doesn't need day-boundary precision)
  // TDEE's training contribution as of that week — trainingKcal (7-day
  // rolling average) × garminCorrection, same formula computeDeficitBudget
  // itself uses (just over a shorter window — see CHART_WINDOW_DAYS).
  // Null when fewer than MIN_REAL_DAYS_FOR_CHART days of REAL calorie data
  // existed in that window — an honest gap, never a guessed/flat-lined
  // value (same rule daysWithRealTrainingCalories exists to protect
  // elsewhere).
  correctedTrainingKcalPerDay: number | null
  // Non-'normal' day_context_notes tags logged within this week (e.g.
  // { sick: 3 }) — Daniel: "också då bra att veta hur den ändrats." Lets
  // the UI say WHY a week dipped (sjuk, resa, skada...) instead of just
  // showing a lower number with no explanation.
  contextTagCounts: Record<string, number>
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// activities should cover at least (weeks * 7 + CHART_WINDOW_DAYS) days
// back from `now` — the caller fetches once, this dedupes once, then
// slices a rolling window per week point. dayTags: user_id-scoped
// day_context_notes rows (date + tag) covering the same range, optional
// since not every caller needs the "why" annotation.
export function computeTrainingKcalTrend(
  activities: (ActivityRow & { calories?: number | null })[],
  garminCorrection: number,
  now: Date,
  weeks = 12,
  dayTags: { date: string; tag: string | null }[] = []
): TrainingKcalTrendPoint[] {
  const deduped = dedupeForStats(activities)
  const tagByDate = new Map(
    dayTags.filter((t): t is { date: string; tag: string } => !!t.tag && t.tag !== 'normal').map(t => [t.date, t.tag])
  )

  const points: TrainingKcalTrendPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() - i * 7)
    const windowStart = new Date(weekEnd)
    windowStart.setDate(windowStart.getDate() - (CHART_WINDOW_DAYS - 1))

    const inWindow = deduped.filter(a => {
      const t = new Date(a.start_date).getTime()
      return t >= windowStart.getTime() && t <= weekEnd.getTime()
    })

    const realDays = daysWithRealTrainingCalories(inWindow)
    const correctedTrainingKcalPerDay = realDays >= MIN_REAL_DAYS_FOR_CHART
      ? Math.round((inWindow.reduce((s, a) => s + (a.calories ?? 0), 0) / CHART_WINDOW_DAYS) * garminCorrection)
      : null

    const contextTagCounts: Record<string, number> = {}
    for (let d = 0; d < CHART_WINDOW_DAYS; d++) {
      const day = new Date(windowStart)
      day.setDate(day.getDate() + d)
      const tag = tagByDate.get(toDateKey(day))
      if (tag) contextTagCounts[tag] = (contextTagCounts[tag] ?? 0) + 1
    }

    points.push({ weekEndDateKey: toDateKey(weekEnd), correctedTrainingKcalPerDay, contextTagCounts })
  }
  return points
}
