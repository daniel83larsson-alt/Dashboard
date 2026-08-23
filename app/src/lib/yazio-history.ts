// One row per day, computed from YAZIO's getDailySummary — the shape is
// deliberately flat/small (not the raw API payload) so history stays cheap
// to store and easy to chart. Energy is always normalized to kcal here,
// since YAZIO lets each account report in kcal OR kJ (summary.units.unit_energy)
// — verified against a real connected account (see STATUS.md).
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
}

const KJ_PER_KCAL = 4.184

// Matches the real shape confirmed against a live account: getDailySummary's
// return type, narrowed to just the fields this app actually reads.
type YazioDailySummary = {
  steps?: number
  goals?: { 'energy.energy'?: number; 'nutrient.protein'?: number; 'nutrient.carb'?: number; 'nutrient.fat'?: number }
  units?: { unit_energy?: string }
  meals?: Record<string, { nutrients?: { 'energy.energy'?: number; 'nutrient.carb'?: number; 'nutrient.fat'?: number; 'nutrient.protein'?: number } }>
  user?: { current_weight?: number }
}

function toKcal(value: number | undefined, unit: string | undefined): number | null {
  if (value == null) return null
  return unit === 'kJ' ? Math.round(value / KJ_PER_KCAL) : Math.round(value)
}

export function summaryToYazioDay(date: string, summary: YazioDailySummary | null): YazioDay | null {
  if (!summary) return null
  const unit = summary.units?.unit_energy
  const meals = Object.values(summary.meals ?? {})
  const sum = (key: 'energy.energy' | 'nutrient.carb' | 'nutrient.fat' | 'nutrient.protein') =>
    meals.reduce((s, m) => s + (m.nutrients?.[key] ?? 0), 0)

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
  }
}

export function daysMetGoal(history: YazioDay[]): number {
  return history.filter(d => d.kcalEaten != null && d.kcalGoal != null && d.kcalEaten <= d.kcalGoal).length
}
