// Pure computation for "Viktmål" — a fixed daily calorie budget (Modell A,
// not "eat back what you trained") aimed at a target weight by a target
// date, plus the 3-layer trust model (daily direction → 7-day average →
// actual weight change) and the periodic calibration check-in. Same
// no-AI/no-I/O contract as kost.ts/weekly-kost.ts — callers do the
// fetching, this file only computes.
//
// The Garmin training-calorie correction factor (default 0.75) is read
// ONLY by this module and its callers (the Viktmål page/route, the
// check-in route, the one-line Veckans Recap mention) — never by
// dashboard/page.tsx's own "ätit vs bränt" card, lib/load.ts, lib/
// records.ts, or anywhere else `activities.calories` is already shown.
// route-invariants.test.ts enforces that boundary mechanically.

const KCAL_PER_KG = 7700

export type DeficitGoalInput = {
  startWeightKg: number
  targetWeightKg: number
  targetDateISO: string // YYYY-MM-DD
  neatFactor: number // vardagsaktivitet utöver träning, default 1.25
  garminCorrection: number // default 0.75, clamped to [0.5, 1.1] by the caller/UI
}

export type DeficitBudget = {
  tdeeKcal: number
  dailyDeficitKcal: number
  budgetKcal: number
  capped: boolean
  // Present only when capped — the deficit needed to hit targetDateISO was
  // outside the safe range, so this is the date that IS achievable at the
  // safe deficit instead, computed from `now`.
  suggestedTargetDateISO: string | null
}

const MIN_SAFE_DEFICIT_KCAL = 0
const MAX_SAFE_DEFICIT_KCAL = 1000
const MIN_BUDGET_FLOOR_KCAL = 1400

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + Math.round(days))
  return d.toISOString().slice(0, 10)
}

function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`).getTime()
  const end = new Date(`${endISO}T00:00:00`).getTime()
  return Math.round((end - start) / 86400000)
}

// bmr: from estimateBMR (lib/bmr.ts) — resting metabolism only.
// avgTrainingKcalRaw: mean of activities.calories per day over the last 28
// calendar days (rest days included in the denominator — that's what turns
// it into a "level" rather than a per-workout figure), deduped via
// dedupeForStats first by the caller. null when fewer than 14 days of
// activity history exist yet — the caller falls back to a user-chosen
// estimate (activityFallbackKcal) instead of a thin, noisy real average.
export function computeDeficitBudget({
  bmr,
  goal,
  avgTrainingKcalRaw,
  activityFallbackKcal,
  now,
}: {
  bmr: number
  goal: DeficitGoalInput
  avgTrainingKcalRaw: number | null
  activityFallbackKcal: number
  now: Date
}): DeficitBudget {
  const trainingKcal = avgTrainingKcalRaw ?? activityFallbackKcal
  const tdeeKcal = Math.round(bmr * goal.neatFactor + trainingKcal * goal.garminCorrection)

  const nowKey = now.toISOString().slice(0, 10)
  const daysLeft = Math.max(1, daysBetween(nowKey, goal.targetDateISO))
  const kgToLose = goal.startWeightKg - goal.targetWeightKg
  const rawDailyDeficit = (kgToLose * KCAL_PER_KG) / daysLeft
  const dailyDeficitKcal = Math.round(Math.min(MAX_SAFE_DEFICIT_KCAL, Math.max(MIN_SAFE_DEFICIT_KCAL, rawDailyDeficit)))

  const floor = Math.max(Math.round(bmr * 1.1), MIN_BUDGET_FLOOR_KCAL)
  const rawBudget = tdeeKcal - dailyDeficitKcal
  const capped = rawBudget < floor
  const budgetKcal = capped ? floor : rawBudget

  let suggestedTargetDateISO: string | null = null
  if (capped) {
    const realisticDailyDeficit = Math.max(1, tdeeKcal - floor)
    const realisticDaysNeeded = (kgToLose * KCAL_PER_KG) / realisticDailyDeficit
    suggestedTargetDateISO = addDays(nowKey, realisticDaysNeeded)
  }

  return { tdeeKcal, dailyDeficitKcal, budgetKcal, capped, suggestedTargetDateISO }
}

export type DailyDeficitStatus = 'grey' | 'green' | 'yellow' | 'red'

// grey = day isn't fully logged yet (caller decides "complete" the same way
// the rest of the app does — computeDayCompleteness for manual Kost days,
// or "YAZIO day has a kcalEaten value" for synced days) — a half-logged day
// must never render as a scary red overshoot.
export function dailyDiffStatus(eatenKcal: number, budgetKcal: number, isComplete: boolean): DailyDeficitStatus {
  if (!isComplete) return 'grey'
  const over = eatenKcal - budgetKcal
  if (over <= 0) return 'green'
  if (over <= 250) return 'yellow'
  return 'red'
}

export type WeeklyDeficitAverage = {
  avgDiffKcal: number | null // eaten - budget, negative = under budget (good). null when too few complete days.
  completeDays: number
  incompleteDays: number
}

const MIN_COMPLETE_DAYS_FOR_AVERAGE = 4

// Only complete days count, and the average itself is hidden (not shown
// with a caveat) below MIN_COMPLETE_DAYS_FOR_AVERAGE — same "hellre inget
// än ett tal som ser exakt ut men inte är det" stance as weekly-kost.ts.
export function compute7DayAverage(days: { eatenKcal: number; isComplete: boolean }[], budgetKcal: number): WeeklyDeficitAverage {
  const complete = days.filter(d => d.isComplete)
  const incompleteDays = days.length - complete.length
  if (complete.length < MIN_COMPLETE_DAYS_FOR_AVERAGE) {
    return { avgDiffKcal: null, completeDays: complete.length, incompleteDays }
  }
  const avgEaten = complete.reduce((s, d) => s + d.eatenKcal, 0) / complete.length
  return { avgDiffKcal: Math.round(avgEaten - budgetKcal), completeDays: complete.length, incompleteDays }
}

export type CheckinPeriodSelection = {
  periodStartDate: string
  periodEndDate: string
  weightStartKg: number
  weightEndKg: number
} | null

const MIN_PERIOD_DAYS = 21

// The period runs from the oldest weigh-in that's at least MIN_PERIOD_DAYS
// before the most recent one, through that most recent one. To dampen
// fluid/glycogen swings (the spec flags this itself), the start/end weights
// used are the MEAN of whatever weigh-ins fall in the first/last 7 days of
// the period, not a single reading — same reasoning as the smoothing an
// N-day average gives anywhere else in this app.
export function selectCheckinPeriod(weighIns: { date: string; weightKg: number }[]): CheckinPeriodSelection {
  if (weighIns.length < 2) return null
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const oldestEligible = sorted.find(w => daysBetween(w.date, latest.date) >= MIN_PERIOD_DAYS)
  if (!oldestEligible) return null

  const periodStartDate = oldestEligible.date
  const periodEndDate = latest.date
  const startWindowEnd = addDays(periodStartDate, 7)
  const endWindowStart = addDays(periodEndDate, -7)
  const startWindow = sorted.filter(w => w.date >= periodStartDate && w.date < startWindowEnd)
  const endWindow = sorted.filter(w => w.date > endWindowStart && w.date <= periodEndDate)
  const meanOf = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length

  return {
    periodStartDate,
    periodEndDate,
    weightStartKg: meanOf(startWindow.map(w => w.weightKg)),
    weightEndKg: meanOf(endWindow.map(w => w.weightKg)),
  }
}

export type DeficitCheckinResult =
  | { status: 'too_sparse'; coverage: number }
  | { status: 'too_small_sample'; predictedKg: number; actualKg: number }
  | { status: 'on_track'; predictedKg: number; actualKg: number }
  | { status: 'adjust'; predictedKg: number; actualKg: number; suggestedCorrection: number; kcalErrorPerDay: number }

const MIN_COVERAGE = 0.7
const MIN_MEANINGFUL_PREDICTED_KG = 0.5
const ON_TRACK_TOLERANCE_KG = 0.4
const MAX_CORRECTION_STEP = 0.10
const MIN_CORRECTION = 0.50
const MAX_CORRECTION = 1.10

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

// loggedDeficitKcal: sum over COMPLETE days in the period of (budgetKcal -
// eatenKcal) — positive means under budget that day. The caller computes
// this per-day and sums it; kept as a single number here so this function
// stays a pure formula, not a day-iteration loop (that loop differs
// depending on whether the source is YAZIO or manual Kost, same split as
// weekly-kost.ts).
export function computeDeficitCheckin({
  periodDays,
  loggedDays,
  loggedDeficitKcal,
  weightStartKg,
  weightEndKg,
  avgTrainingKcalRaw,
  oldCorrection,
}: {
  periodDays: number
  loggedDays: number
  loggedDeficitKcal: number
  weightStartKg: number
  weightEndKg: number
  avgTrainingKcalRaw: number
  oldCorrection: number
}): DeficitCheckinResult {
  const coverage = loggedDays / periodDays
  if (coverage < MIN_COVERAGE) return { status: 'too_sparse', coverage }

  const predictedKg = (loggedDeficitKcal / KCAL_PER_KG) * (periodDays / loggedDays)
  const actualKg = weightStartKg - weightEndKg

  if (Math.abs(predictedKg) < MIN_MEANINGFUL_PREDICTED_KG) return { status: 'too_small_sample', predictedKg, actualKg }
  if (Math.abs(actualKg - predictedKg) <= ON_TRACK_TOLERANCE_KG) return { status: 'on_track', predictedKg, actualKg }

  const kcalErrorPerDay = ((actualKg - predictedKg) * KCAL_PER_KG) / periodDays
  const impliedFactor = oldCorrection + kcalErrorPerDay / Math.max(avgTrainingKcalRaw, 200)
  const dampened = oldCorrection + 0.5 * (impliedFactor - oldCorrection)
  const stepped = clamp(dampened, oldCorrection - MAX_CORRECTION_STEP, oldCorrection + MAX_CORRECTION_STEP)
  const suggestedCorrection = Math.round(clamp(stepped, MIN_CORRECTION, MAX_CORRECTION) * 100) / 100

  return { status: 'adjust', predictedKg, actualKg, suggestedCorrection, kcalErrorPerDay }
}
