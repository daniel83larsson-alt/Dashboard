// One row per day, computed from YAZIO's getDailySummary — the shape is
// deliberately flat/small (not the raw API payload) so history stays cheap
// to store and easy to chart. Energy is always normalized to kcal here,
// since YAZIO lets each account report in kcal OR kJ (summary.units.unit_energy)
// — verified against a real connected account (see STATUS.md).
export type YazioMeal = {
  kcal: number | null
  kcalGoal: number | null
  carbG: number | null
  fatG: number | null
  proteinG: number | null
}

export type YazioDay = {
  date: string
  kcalEaten: number | null
  kcalGoal: number | null
  proteinG: number | null
  proteinGoalG: number | null
  carbG: number | null
  fatG: number | null
  steps: number | null
  weightKg: number | null
  startWeightKg: number | null
  weightGoal: string | null // YAZIO's raw goal direction, e.g. 'lose' | 'gain' | 'maintain'
  waterMl: number | null
  waterGoalMl: number | null
  activityKcal: number | null // YAZIO's own activity-calorie estimate — a second, independent number from Garmin's
  fastingTemplate: string | null // e.g. '16_8_early_fasting_v2', null when no active fast
  meals: { breakfast: YazioMeal | null; lunch: YazioMeal | null; dinner: YazioMeal | null; snack: YazioMeal | null }
}

const KJ_PER_KCAL = 4.184

// Matches the real shape confirmed against a live account: getDailySummary's
// return type, narrowed to just the fields this app actually reads.
type Nutrients = { 'energy.energy'?: number; 'nutrient.carb'?: number; 'nutrient.fat'?: number; 'nutrient.protein'?: number }
type YazioDailySummary = {
  steps?: number
  activity_energy?: number
  water_intake?: number
  active_fasting_countdown_template_key?: string | null
  goals?: Nutrients & { water?: number }
  units?: { unit_energy?: string }
  meals?: Record<string, { nutrients?: Nutrients; energy_goal?: number }>
  user?: { start_weight?: number; current_weight?: number; goal?: string }
}

function toKcal(value: number | undefined | null, unit: string | undefined): number | null {
  if (value == null) return null
  return unit === 'kJ' ? Math.round(value / KJ_PER_KCAL) : Math.round(value)
}

function toMeal(m: { nutrients?: Nutrients; energy_goal?: number } | undefined, unit: string | undefined): YazioMeal | null {
  if (!m) return null
  return {
    kcal: toKcal(m.nutrients?.['energy.energy'], unit),
    kcalGoal: toKcal(m.energy_goal, unit),
    carbG: m.nutrients?.['nutrient.carb'] != null ? Math.round(m.nutrients['nutrient.carb']) : null,
    fatG: m.nutrients?.['nutrient.fat'] != null ? Math.round(m.nutrients['nutrient.fat']) : null,
    proteinG: m.nutrients?.['nutrient.protein'] != null ? Math.round(m.nutrients['nutrient.protein']) : null,
  }
}

export function summaryToYazioDay(date: string, summary: YazioDailySummary | null): YazioDay | null {
  if (!summary) return null
  const unit = summary.units?.unit_energy
  const meals = Object.values(summary.meals ?? {})
  const sum = (key: keyof Nutrients) => meals.reduce((s, m) => s + (m.nutrients?.[key] ?? 0), 0)

  return {
    date,
    kcalEaten: toKcal(sum('energy.energy'), unit),
    kcalGoal: toKcal(summary.goals?.['energy.energy'], unit),
    proteinG: Math.round(sum('nutrient.protein')),
    proteinGoalG: summary.goals?.['nutrient.protein'] != null ? Math.round(summary.goals['nutrient.protein']) : null,
    carbG: Math.round(sum('nutrient.carb')),
    fatG: Math.round(sum('nutrient.fat')),
    steps: summary.steps ?? null,
    weightKg: summary.user?.current_weight ?? null,
    startWeightKg: summary.user?.start_weight ?? null,
    weightGoal: summary.user?.goal ?? null,
    waterMl: summary.water_intake ?? null,
    waterGoalMl: summary.goals?.water ?? null,
    activityKcal: summary.activity_energy != null ? Math.round(summary.activity_energy) : null,
    fastingTemplate: summary.active_fasting_countdown_template_key ?? null,
    meals: {
      breakfast: toMeal(summary.meals?.breakfast, unit),
      lunch: toMeal(summary.meals?.lunch, unit),
      dinner: toMeal(summary.meals?.dinner, unit),
      snack: toMeal(summary.meals?.snack, unit),
    },
  }
}

// A history row written by an OLDER version of summaryToYazioDay (before
// meals/water/fasting/weight-trend were added) is missing those fields
// entirely — not null, absent — since it's read straight back out of
// already-stored JSON, not re-validated. Object.entries(undefined) throws,
// so every consumer of stored history must run rows through this first.
// Real incident: a user's very first sync predated this extension, and
// their Mat page hard-crashed until this normalization existed (see
// STATUS.md). Only used as read-side backward-compat — the DB row itself
// is never rewritten by this, only fixed by that user's next real sync.
export function normalizeYazioDay(d: Partial<YazioDay> & { date: string }): YazioDay {
  return {
    date: d.date,
    kcalEaten: d.kcalEaten ?? null,
    kcalGoal: d.kcalGoal ?? null,
    proteinG: d.proteinG ?? null,
    proteinGoalG: d.proteinGoalG ?? null,
    carbG: d.carbG ?? null,
    fatG: d.fatG ?? null,
    steps: d.steps ?? null,
    weightKg: d.weightKg ?? null,
    startWeightKg: d.startWeightKg ?? null,
    weightGoal: d.weightGoal ?? null,
    waterMl: d.waterMl ?? null,
    waterGoalMl: d.waterGoalMl ?? null,
    activityKcal: d.activityKcal ?? null,
    fastingTemplate: d.fastingTemplate ?? null,
    meals: d.meals ?? { breakfast: null, lunch: null, dinner: null, snack: null },
  }
}

export function daysMetGoal(history: YazioDay[]): number {
  return history.filter(d => d.kcalEaten != null && d.kcalGoal != null && d.kcalEaten <= d.kcalGoal).length
}

const MEAL_LABELS: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', string> = {
  breakfast: 'Frukost', lunch: 'Lunch', dinner: 'Middag', snack: 'Mellanmål',
}
export function mealLabel(key: 'breakfast' | 'lunch' | 'dinner' | 'snack'): string {
  return MEAL_LABELS[key]
}

// '16_8_early_fasting_v2' → '16:8'. Falls back to a generic label for any
// template-key shape YAZIO adds later rather than showing the raw
// underscored key or hiding it entirely.
export function fastingLabel(key: string | null): string | null {
  if (!key) return null
  const m = key.match(/^(\d+)_(\d+)/)
  return m ? `${m[1]}:${m[2]}-fasta` : 'Fasta aktiv'
}

const WEIGHT_GOAL_LABELS: Record<string, string> = { lose: 'Gå ner i vikt', gain: 'Gå upp i vikt', maintain: 'Behålla vikt' }
export function weightGoalLabel(goal: string | null): string | null {
  if (!goal) return null
  return WEIGHT_GOAL_LABELS[goal] ?? goal
}
