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

export type SafetyBreach = 'deficit_above_max' | 'below_budget_floor' | 'below_hard_floor'

// The honest numbers behind a possibly-capped budget — always present, even
// when nothing was breached (breaches: []). Lets a caller show "here's what
// your date actually implies, and here's the safe alternative" instead of
// silently substituting one for the other (Daniel: warn, don't silently
// block or silently allow).
export type DeficitSafety = {
  requestedDailyDeficitKcal: number // what targetDateISO literally implies, floored at 0 (never negative for a "gain" goal)
  requestedBudgetKcal: number // tdee - requested, NOT floored — can be unrealistically low
  breaches: SafetyBreach[] // empty = the requested budget is already safe
  maxSafeDeficitKcal: number
  budgetFloorKcal: number // max(round(bmr*1.1), MIN_BUDGET_FLOOR_KCAL)
  hardFloorKcal: number // ABSOLUTE_MIN_BUDGET_KCAL — never overridable, see computeDeficitBudget
  safeDailyDeficitKcal: number
  safeBudgetKcal: number
  // The date reachable at the SAFE rate — present whenever there's a breach
  // to explain, regardless of whether allowUnsafe ended up overriding it.
  suggestedTargetDateISO: string | null
}

export type DeficitBudget = {
  tdeeKcal: number
  dailyDeficitKcal: number
  budgetKcal: number
  capped: boolean
  // True when a breach exists AND allowUnsafe was passed — the budget in
  // force is the (clamped-to-the-hard-floor) requested one, not the safe one.
  overrideActive: boolean
  // Present only when capped (unchanged meaning from before overrides
  // existed) — the date achievable at the safe deficit instead. Use
  // safety.suggestedTargetDateISO to see it even while overriding.
  suggestedTargetDateISO: string | null
  safety: DeficitSafety
}

const MIN_SAFE_DEFICIT_KCAL = 0
// Exported so UI code (the 7-dagars-snitt color) can flag "your actual
// pace has drifted past the recommended max" without duplicating the
// threshold — same number computeDeficitBudget's own breach check uses.
export const MAX_SAFE_DEFICIT_KCAL = 1000
const MIN_BUDGET_FLOOR_KCAL = 1400

// A hard floor/ceiling that NOT EVEN an explicit user acknowledgement can
// cross — Daniel's confirmed call: this is health data, and a ceiling that
// can never be clicked away protects against a genuinely dangerous goal
// regardless of how many times "use anyway" gets pressed.
const ABSOLUTE_MIN_BUDGET_KCAL = 1200
const ABSOLUTE_MAX_DEFICIT_KCAL = 1500

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

// Whether there's enough REAL calorie data (not just activity rows) to
// trust an average over a flat fallback. Real incident: Garmin's and
// Concept2's sync never populate activities.calories at all (Garmin only
// fetches calories at the whole-day wellness level, Concept2's sync
// doesn't touch it) — so for a rowing-only user, "≥14 days WITH an
// activity" is not the same as "≥14 days of real calorie data". Counting
// bare activity-days let the average silently collapse toward ~0 (summing
// mostly-null calories) the moment someone crossed the day threshold,
// which is a WORSE estimate than the flat activityFallbackKcal it was
// meant to graduate away from — a real user saw their budget drop ~220
// kcal from this the moment their window happened to cross the line.
// Counting only days that actually have a non-null calories value fixes
// it: those users correctly keep falling back to the flat estimate.
export function daysWithRealTrainingCalories(activities: { start_date: string; calories?: number | null }[]): number {
  return new Set(activities.filter(a => a.calories != null).map(a => a.start_date.slice(0, 10))).size
}

// bmr: from estimateBMR (lib/bmr.ts) — resting metabolism only.
// avgTrainingKcalRaw: mean of activities.calories per day over the last 28
// calendar days (rest days included in the denominator — that's what turns
// it into a "level" rather than a per-workout figure), deduped via
// dedupeForStats first by the caller. null when fewer than 14 days of
// REAL calorie data exist yet (see daysWithRealTrainingCalories above) —
// the caller falls back to a user-chosen estimate (activityFallbackKcal)
// instead of a thin, noisy real average.
export function computeDeficitBudget({
  bmr,
  goal,
  avgTrainingKcalRaw,
  activityFallbackKcal,
  now,
  allowUnsafe = false,
}: {
  bmr: number
  goal: DeficitGoalInput
  avgTrainingKcalRaw: number | null
  activityFallbackKcal: number
  now: Date
  // Caller has already verified a valid, still-matching acknowledgement
  // (see deficitOverrideSignature) — this function does not check that
  // itself, it only applies the ABSOLUTE_* hard floor once asked to.
  allowUnsafe?: boolean
}): DeficitBudget {
  const trainingKcal = avgTrainingKcalRaw ?? activityFallbackKcal
  const tdeeKcal = Math.round(bmr * goal.neatFactor + trainingKcal * goal.garminCorrection)

  const nowKey = now.toISOString().slice(0, 10)
  const daysLeft = Math.max(1, daysBetween(nowKey, goal.targetDateISO))
  const kgToLose = goal.startWeightKg - goal.targetWeightKg
  const rawDailyDeficit = (kgToLose * KCAL_PER_KG) / daysLeft

  // What the target date literally implies, floored at 0 (a "gain" goal is
  // never a negative deficit) but NOT capped at MAX_SAFE_DEFICIT_KCAL —
  // this is the honest number shown to the user, safe or not.
  const requestedDailyDeficitKcal = Math.round(Math.max(MIN_SAFE_DEFICIT_KCAL, rawDailyDeficit))
  const requestedBudgetKcal = tdeeKcal - requestedDailyDeficitKcal

  const budgetFloorKcal = Math.max(Math.round(bmr * 1.1), MIN_BUDGET_FLOOR_KCAL)

  const breaches: SafetyBreach[] = []
  if (requestedDailyDeficitKcal > MAX_SAFE_DEFICIT_KCAL) breaches.push('deficit_above_max')
  if (requestedBudgetKcal < budgetFloorKcal) breaches.push('below_budget_floor')
  if (requestedDailyDeficitKcal > ABSOLUTE_MAX_DEFICIT_KCAL || requestedBudgetKcal < ABSOLUTE_MIN_BUDGET_KCAL) {
    breaches.push('below_hard_floor')
  }

  const safeDailyDeficitKcal = Math.round(Math.min(MAX_SAFE_DEFICIT_KCAL, Math.max(MIN_SAFE_DEFICIT_KCAL, rawDailyDeficit)))
  const safeBudgetKcal = Math.max(budgetFloorKcal, tdeeKcal - safeDailyDeficitKcal)

  let suggestedTargetDateISO: string | null = null
  if (breaches.length > 0) {
    const realisticDailyDeficit = Math.max(1, tdeeKcal - budgetFloorKcal)
    const realisticDaysNeeded = (kgToLose * KCAL_PER_KG) / realisticDailyDeficit
    suggestedTargetDateISO = addDays(nowKey, realisticDaysNeeded)
  }

  const safety: DeficitSafety = {
    requestedDailyDeficitKcal,
    requestedBudgetKcal,
    breaches,
    maxSafeDeficitKcal: MAX_SAFE_DEFICIT_KCAL,
    budgetFloorKcal,
    hardFloorKcal: ABSOLUTE_MIN_BUDGET_KCAL,
    safeDailyDeficitKcal,
    safeBudgetKcal,
    suggestedTargetDateISO,
  }

  if (breaches.length === 0) {
    return {
      tdeeKcal, dailyDeficitKcal: requestedDailyDeficitKcal, budgetKcal: requestedBudgetKcal,
      capped: false, overrideActive: false, suggestedTargetDateISO: null, safety,
    }
  }

  if (allowUnsafe) {
    // Recompute the budget FROM the clamped deficit so budget+deficit
    // always sum to tdeeKcal exactly, rather than clamping each
    // independently and risking them disagreeing.
    const clampedDeficit = Math.min(requestedDailyDeficitKcal, ABSOLUTE_MAX_DEFICIT_KCAL)
    const budgetKcal = Math.max(tdeeKcal - clampedDeficit, ABSOLUTE_MIN_BUDGET_KCAL)
    return {
      tdeeKcal, dailyDeficitKcal: tdeeKcal - budgetKcal, budgetKcal,
      capped: false, overrideActive: true, suggestedTargetDateISO: null, safety,
    }
  }

  return {
    tdeeKcal, dailyDeficitKcal: safeDailyDeficitKcal, budgetKcal: safeBudgetKcal,
    capped: true, overrideActive: false, suggestedTargetDateISO, safety,
  }
}

// Binds an above-safe acknowledgement to the exact goal it was given for —
// change the target weight or date and the signature no longer matches, so
// a stale "yes, use this anyway" can never silently carry over onto a
// different (possibly even more aggressive) goal. Deliberately excludes
// neatFactor/garminCorrection: a check-in nudging the correction factor is
// not the user changing their mind about the goal itself.
export function deficitOverrideSignature(goal: { startWeightKg: number; targetWeightKg: number; targetDateISO: string }): string {
  return `${goal.startWeightKg.toFixed(1)}|${goal.targetWeightKg.toFixed(1)}|${goal.targetDateISO}`
}

// Swedish one-liner per breach, used by the warn-but-allow UI (Profil-
// formuläret) to name which specific rail a too-aggressive goal breaks —
// never just a generic "for aggressive" message.
export function safetyBreachLabel(breach: SafetyBreach): string {
  switch (breach) {
    case 'deficit_above_max':
      return 'Underskottet är högre än vad vi normalt rekommenderar (max 1000 kcal/dag).'
    case 'below_budget_floor':
      return 'Budgeten hamnar under en säker lägstanivå för din kropp.'
    case 'below_hard_floor':
      return 'Det här ligger vid den absoluta säkerhetsgränsen — går inte att sätta lägre ens med en bekräftelse.'
  }
}

// Swedish one-liner per rejection, used by the delmål-create UI/route to
// explain exactly why a proposed milestone falls outside the "closer,
// same-direction, before-the-overall-date" range resolveActiveGoalSegment
// requires.
export function milestoneRejectedReasonLabel(reason: MilestoneRejectedReason): string {
  switch (reason) {
    case 'wrong_direction':
      return 'Delmålet går åt fel håll jämfört med din nuvarande vikt.'
    case 'beyond_overall_target':
      return 'Delmålet går längre än ditt övergripande mål — det ska vara en delsträcka på vägen dit, inte förbi.'
    case 'not_before_overall_date':
      return 'Delmålets datum måste ligga före ditt övergripande måldatum.'
  }
}

export type RollingWeight = {
  avgKg: number | null // null below minReadings — never a fake-precise number from too little data
  readings: number
  latestKg: number | null
  latestDate: string | null
  windowDays: number
}

// Smooths the "current weight" figure the same way compute7DayAverage
// smooths the calorie diff — one bad morning (dehydration, a late heavy
// meal) shouldn't move the headline number. Two call shapes in practice:
// display (small window/sample, hidden fast when data's thin) and the
// goal-segment math (wider window, falls back to a single reading sooner
// since a delmål calculation needs SOME number to start from).
export function computeRollingWeightAverage(
  weighIns: { date: string; weightKg: number }[],
  todayKey: string,
  opts?: { windowDays?: number; maxReadings?: number; minReadings?: number },
): RollingWeight {
  const windowDays = opts?.windowDays ?? 10
  const maxReadings = opts?.maxReadings ?? 3
  const minReadings = opts?.minReadings ?? 2

  const sorted = [...weighIns].sort((a, b) => b.date.localeCompare(a.date)) // newest first
  const latest = sorted[0] ?? null
  const windowStart = addDays(todayKey, -windowDays)
  const inWindow = sorted.filter(w => w.date >= windowStart && w.date <= todayKey).slice(0, maxReadings)

  const avgKg = inWindow.length >= minReadings
    ? Math.round((inWindow.reduce((s, w) => s + w.weightKg, 0) / inWindow.length) * 10) / 10
    : null

  return {
    avgKg,
    readings: inWindow.length,
    latestKg: latest?.weightKg ?? null,
    latestDate: latest?.date ?? null,
    windowDays,
  }
}

// Real, MEASURED weight-loss pace — a recent RATE_WINDOW_DAYS average
// against the window right before it — never a theoretical rate implied by
// logged calories. Daniel: "Med denna hastighet... när du målet redan då"
// but explicitly wants it to warn rather than cheer on an unsafe pace
// ("Kör A" — always show the honest projection, flag it in red if it's
// faster than we recommend, instead of hiding it or capping it silently).
// Shared by the Viktmål page and the MCP get_goal_progress tool so the two
// surfaces can never quietly disagree about the same pace — this used to be
// duplicated logic living only in lib/mcp/goal-progress.ts.
export type WeightTrendProjection = {
  lossRatePerDayKg: number | null
  projectedDateISO: string | null
  onTrack: boolean | null // vs targetDateISO — null if no projection or no target date to compare against
  tooFast: boolean // pace implies a bigger daily deficit than MAX_SAFE_DEFICIT_KCAL
}

const RATE_WINDOW_DAYS = 7
const MIN_MEANINGFUL_LOSS_RATE_KG_PER_DAY = 0.01 // ~70g/week — below this, "current pace" can't honestly project a date

function avgWeightInRange(weighIns: { date: string; weightKg: number }[], startKey: string, endKeyInclusive: string): number | null {
  const vals = weighIns.filter(w => w.date >= startKey && w.date <= endKeyInclusive).map(w => w.weightKg)
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
}

export function computeWeightTrendProjection(
  weighIns: { date: string; weightKg: number }[],
  currentWeightKg: number | null,
  targetWeightKg: number | null,
  targetDateISO: string | null,
  todayKey: string,
): WeightTrendProjection {
  const recentAvg = avgWeightInRange(weighIns, addDays(todayKey, -(RATE_WINDOW_DAYS - 1)), todayKey)
  const priorAvg = avgWeightInRange(weighIns, addDays(todayKey, -(2 * RATE_WINDOW_DAYS - 1)), addDays(todayKey, -RATE_WINDOW_DAYS))
  // Positive = losing weight per day (this app only supports loss goals today).
  const lossRatePerDayKg = recentAvg != null && priorAvg != null ? (priorAvg - recentAvg) / RATE_WINDOW_DAYS : null

  let projectedDateISO: string | null = null
  if (targetWeightKg != null && currentWeightKg != null) {
    const remainingKg = currentWeightKg - targetWeightKg
    if (remainingKg <= 0) {
      projectedDateISO = todayKey
    } else if (lossRatePerDayKg != null && lossRatePerDayKg >= MIN_MEANINGFUL_LOSS_RATE_KG_PER_DAY) {
      projectedDateISO = addDays(todayKey, Math.ceil(remainingKg / lossRatePerDayKg))
    }
  }
  const onTrack = projectedDateISO != null && targetDateISO != null ? projectedDateISO <= targetDateISO : null
  const tooFast = lossRatePerDayKg != null && lossRatePerDayKg * KCAL_PER_KG > MAX_SAFE_DEFICIT_KCAL

  return { lossRatePerDayKg, projectedDateISO, onTrack, tooFast }
}

export type GoalSegmentSource = 'overall' | 'milestone'

export type MilestoneInput = {
  targetWeightKg: number
  targetDateISO: string
  overrideAcknowledged: boolean
}

export type MilestoneRejectedReason = 'wrong_direction' | 'beyond_overall_target' | 'not_before_overall_date'

export type GoalSegment = {
  source: GoalSegmentSource
  targetWeightKg: number
  targetDateISO: string
  overrideAcknowledged: boolean
  validUntilISO: string | null // the milestone's own date when source === 'milestone', else null
  milestoneExpired: boolean // a milestone existed but its date has already passed
  milestoneRejectedReason: MilestoneRejectedReason | null
}

// Decides which goal the ONE active budget is aimed at right now — the
// overall goal, or a nearer-term milestone layered on top of it. A
// milestone never replaces the overall goal's own stored target; it's
// always resolved fresh against it here.
export function resolveActiveGoalSegment(input: {
  overall: { startWeightKg: number; targetWeightKg: number; targetDateISO: string; overrideAcknowledged: boolean }
  milestone: MilestoneInput | null
  todayKey: string
}): GoalSegment {
  const { overall, milestone, todayKey } = input

  const overallSegment: GoalSegment = {
    source: 'overall',
    targetWeightKg: overall.targetWeightKg,
    targetDateISO: overall.targetDateISO,
    overrideAcknowledged: overall.overrideAcknowledged,
    validUntilISO: null,
    milestoneExpired: false,
    milestoneRejectedReason: null,
  }

  if (!milestone) return overallSegment

  if (milestone.targetDateISO < todayKey) {
    return { ...overallSegment, milestoneExpired: true }
  }

  // Valid range for a loss goal: overallTarget <= milestoneTarget < overallStart
  // (mirrored for a gain goal). Two distinct ways to fall outside it:
  // not even past the starting weight ('wrong_direction'), or past the
  // overall target itself — more aggressive than the final goal
  // ('beyond_overall_target').
  const isLossGoal = overall.targetWeightKg < overall.startWeightKg
  let rejectedReason: MilestoneRejectedReason | null = null
  if (isLossGoal) {
    if (milestone.targetWeightKg >= overall.startWeightKg) rejectedReason = 'wrong_direction'
    else if (milestone.targetWeightKg < overall.targetWeightKg) rejectedReason = 'beyond_overall_target'
  } else {
    if (milestone.targetWeightKg <= overall.startWeightKg) rejectedReason = 'wrong_direction'
    else if (milestone.targetWeightKg > overall.targetWeightKg) rejectedReason = 'beyond_overall_target'
  }
  if (!rejectedReason && milestone.targetDateISO >= overall.targetDateISO) {
    rejectedReason = 'not_before_overall_date'
  }

  if (rejectedReason) return { ...overallSegment, milestoneRejectedReason: rejectedReason }

  return {
    source: 'milestone',
    targetWeightKg: milestone.targetWeightKg,
    targetDateISO: milestone.targetDateISO,
    overrideAcknowledged: milestone.overrideAcknowledged,
    validUntilISO: milestone.targetDateISO,
    milestoneExpired: false,
    milestoneRejectedReason: null,
  }
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

// Each day carries its OWN budget rather than one shared value for the
// whole window — Daniel: "bara för de ändrades så ändrades siffrorna
// längst ner över veckodagen... egentligen ska inte de ändras retroaktivt."
// A day that already happened under an OLD budget must keep showing its
// diff against THAT budget forever, even after today's budget changes —
// see budgetInForceOn below, which reconstructs it per day from
// deficit_budget_events. Averaging each day's own diff (rather than
// avg(eaten) - one budget) is mathematically identical to the old
// behavior whenever the budget never changed within the window, so this
// is a pure widening, not a behavior change, for the common case.
export function compute7DayAverage(days: { eatenKcal: number; isComplete: boolean; budgetKcal: number }[]): WeeklyDeficitAverage {
  const complete = days.filter(d => d.isComplete)
  const incompleteDays = days.length - complete.length
  if (complete.length < MIN_COMPLETE_DAYS_FOR_AVERAGE) {
    return { avgDiffKcal: null, completeDays: complete.length, incompleteDays }
  }
  const avgDiffKcal = complete.reduce((s, d) => s + (d.eatenKcal - d.budgetKcal), 0) / complete.length
  return { avgDiffKcal: Math.round(avgDiffKcal), completeDays: complete.length, incompleteDays }
}

// Each day carries its own TDEE for the same reason compute7DayAverage
// takes a per-day budget — TDEE and budget are frozen together at every
// refreeze, so a stale-TDEE "actual deficit vs TDEE" figure would still
// drift retroactively even after the budget side alone was fixed. This is
// the direct eaten-vs-TDEE average (negative = deficit) — no separate
// conversion trick needed, unlike the old budget-relative-then-converted
// approach.
export function computeAvgDiffVsTdee(days: { eatenKcal: number; isComplete: boolean; tdeeKcal: number }[]): WeeklyDeficitAverage {
  const complete = days.filter(d => d.isComplete)
  const incompleteDays = days.length - complete.length
  if (complete.length < MIN_COMPLETE_DAYS_FOR_AVERAGE) {
    return { avgDiffKcal: null, completeDays: complete.length, incompleteDays }
  }
  const avgDiffKcal = complete.reduce((s, d) => s + (d.eatenKcal - d.tdeeKcal), 0) / complete.length
  return { avgDiffKcal: Math.round(avgDiffKcal), completeDays: complete.length, incompleteDays }
}

export type BudgetEvent = { createdAt: string; newBudgetKcal: number | null; newTdeeKcal?: number | null }

// Reconstructs which budget was actually in force on a given day, instead
// of assuming today's current budget applied retroactively for the whole
// history — moved here from the one place that already got this right
// (deficit/checkin/route.ts's avstämning) so every other day-list/average
// in the app can share it instead of just assuming "today's budget always
// applied". Falls back to the current budget for any day at or before the
// first event (covers the whole history before this event log existed, or
// before the user's very first budget was ever frozen).
export function budgetInForceOn(dateKey: string, currentBudgetKcal: number, events: BudgetEvent[]): number {
  const dayEndIso = new Date(`${dateKey}T23:59:59.999`).toISOString()
  let effective = currentBudgetKcal
  for (const ev of events) {
    if (ev.createdAt > dayEndIso) break
    if (ev.newBudgetKcal != null) effective = ev.newBudgetKcal
  }
  return effective
}

// Same reconstruction as budgetInForceOn, for TDEE — see
// computeAvgDiffVsTdee's comment for why this needs its own history
// rather than reusing the current TDEE for every day. Events recorded
// before new_tdee_kcal existed simply have no opinion (newTdeeKcal null)
// and are skipped, same graceful bootstrap as the budget side.
export function tdeeInForceOn(dateKey: string, currentTdeeKcal: number, events: BudgetEvent[]): number {
  const dayEndIso = new Date(`${dateKey}T23:59:59.999`).toISOString()
  let effective = currentTdeeKcal
  for (const ev of events) {
    if (ev.createdAt > dayEndIso) break
    if (ev.newTdeeKcal != null) effective = ev.newTdeeKcal
  }
  return effective
}

// The point-in-time inputs a budget/TDEE event was computed from — lets
// the UI diff two consecutive events and say what actually changed
// (Daniel: "lite dumt att man ser ändringen, men inte vad egentligen de
// var som triggade ett lägre TDEE") instead of just showing before/after
// kcal with no explanation. Missing/null fields (events recorded before
// these columns existed) are silently skipped rather than shown as "null
// → 1980", so old history doesn't produce a nonsense explanation.
export type BudgetChangeInputs = {
  bmrKcal: number | null
  trainingKcal: number | null
  neatFactor: number | null
  garminCorrection: number | null
}

export function explainBudgetChange(current: BudgetChangeInputs, previous: BudgetChangeInputs | null): string | null {
  if (!previous) return null
  const parts: string[] = []
  // Narrative direction word, not just the raw numbers — Daniel: "en
  // tydlig trigger_detail som 'Träningsvolymen ökade senaste veckorna
  // efter uppehåll'... då får du full insyn i varför." Deliberately stops
  // at "ökade"/"minskade" rather than inventing a specific cause like
  // "efter uppehåll" — this function only ever sees two point-in-time
  // snapshots, not the daily activity history, so it has no honest way to
  // know WHY the average moved, only that it did and in which direction.
  if (previous.trainingKcal != null && current.trainingKcal != null && previous.trainingKcal !== current.trainingKcal) {
    const direction = current.trainingKcal > previous.trainingKcal ? 'ökade' : 'minskade'
    parts.push(`Träningsvolymen ${direction} (snitt ${previous.trainingKcal} → ${current.trainingKcal} kcal/dag)`)
  }
  if (previous.bmrKcal != null && current.bmrKcal != null && previous.bmrKcal !== current.bmrKcal) {
    parts.push(`Vilo-omsättning ${previous.bmrKcal} → ${current.bmrKcal} kcal`)
  }
  if (previous.neatFactor != null && current.neatFactor != null && previous.neatFactor !== current.neatFactor) {
    parts.push(`Vardagsaktivitet ${previous.neatFactor} → ${current.neatFactor}`)
  }
  if (previous.garminCorrection != null && current.garminCorrection != null && previous.garminCorrection !== current.garminCorrection) {
    parts.push(`Garmin-korrigering ${previous.garminCorrection} → ${current.garminCorrection}`)
  }
  return parts.length ? parts.join(' · ') : null
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
