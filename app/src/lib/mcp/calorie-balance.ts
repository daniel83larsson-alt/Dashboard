// Pure: builds get_calorie_balance(days)'s exact JSON payload. Daniel:
// "ett komplement till get_weekly_summary som separerar de två sidorna av
// ekvationen tydligt (ätit kontra TDEE/bränt), snarare än bara den färdiga
// diffen" — weekly-summary.ts already collapses eaten-vs-TDEE into a
// single kcal_diff_avg_7d, which can't answer "is the gap because I ate
// too little, or because TDEE is calculated too high?" without this.
import { resolveDayNutrition } from '@/lib/day-nutrition-source'
import { resolveEffectiveCalorieGoal } from '@/lib/calorie-goal'
import { budgetInForceOn, tdeeInForceOn, daysWithRealTrainingCalories, type BudgetEvent } from '@/lib/deficit'
import { dateKeysEndingToday } from './window'
import type { McpUserData } from './fetch-user-data'
import type { McpActivity } from './fetch-training-data'

export type CalorieBalance = {
  period_days: number
  avg_kcal_eaten: number | null
  avg_tdee: number | null
  avg_training_burn_component: number | null
  avg_budget: number | null
  avg_diff_vs_budget: number | null // eaten − budget; negative = a deficit (matches the app's own sign convention elsewhere)
  days_with_logged_training: number
}

// floor(days/2) reproduces both thresholds already independently tuned
// elsewhere for the same reason (a strict 50%-of-window ratio is too
// strict on a short window for Daniel's real every-other-day cadence):
// floor(7/2)=3 matches the Insikter chart's old 7-day 3-of-7 threshold,
// floor(14/2)=7 matches deficit-budget-refreeze.ts's own 14-day 7-of-14 —
// so this one formula serves get_calorie_balance's caller-chosen window
// without silently regressing to a too-strict ratio for the default days=7.
function minRealTrainingDays(days: number): number {
  return Math.floor(days / 2)
}

export function computeCalorieBalance(
  data: McpUserData,
  activities: McpActivity[],
  budgetEvents: BudgetEvent[],
  garminCorrection: number,
  todayKey: string,
  days: number,
): CalorieBalance {
  const { profile, yazioByDate, manualByDate, dayOverrides, trackedMeals } = data
  const dateKeys = dateKeysEndingToday(todayKey, days)

  const currentTdeeKcal = profile?.deficit_tdee_kcal ?? null
  const effectiveGoal = resolveEffectiveCalorieGoal({
    dailyCalorieGoal: profile?.daily_calorie_goal ?? null,
    deficitTrackingEnabled: profile?.deficit_tracking_enabled ?? false,
    deficitBudgetKcal: profile?.deficit_budget_kcal ?? null,
  })
  const currentBudgetKcal = effectiveGoal.kcal

  // Only complete days count toward the eaten average — same philosophy
  // as compute7DayAverage/computeAvgDiffVsTdee: an incomplete day (missed
  // logging a meal) shouldn't drag the average toward "ate almost nothing".
  const completeDays = dateKeys
    .map(date => resolveDayNutrition(date, yazioByDate, manualByDate, trackedMeals, dayOverrides))
    .filter(d => d.isComplete)
  const avgKcalEaten = completeDays.length
    ? Math.round(completeDays.reduce((s, d) => s + d.eatenKcal, 0) / completeDays.length)
    : null

  // Historically-correct TDEE/budget per day (same reconstruction
  // get_weekly_summary already uses) rather than assuming today's current
  // values applied retroactively for the whole window.
  const avgTdee = currentTdeeKcal != null
    ? Math.round(dateKeys.reduce((s, d) => s + tdeeInForceOn(d, currentTdeeKcal, budgetEvents), 0) / dateKeys.length)
    : null
  const avgBudget = currentBudgetKcal != null
    ? Math.round(dateKeys.reduce((s, d) => s + budgetInForceOn(d, currentBudgetKcal, budgetEvents), 0) / dateKeys.length)
    : null

  const windowStartIso = new Date(`${dateKeys[0]}T00:00:00`).toISOString()
  const activitiesInWindow = activities.filter(a => a.start_date >= windowStartIso)
  const trainingDaysWithRealCalories = daysWithRealTrainingCalories(activitiesInWindow)
  const avgTrainingBurnComponent = trainingDaysWithRealCalories >= minRealTrainingDays(days)
    ? Math.round((activitiesInWindow.reduce((s, a) => s + (a.calories ?? 0), 0) / days) * garminCorrection)
    : null

  return {
    period_days: days,
    avg_kcal_eaten: avgKcalEaten,
    avg_tdee: avgTdee,
    avg_training_burn_component: avgTrainingBurnComponent,
    avg_budget: avgBudget,
    avg_diff_vs_budget: avgKcalEaten != null && avgBudget != null ? avgKcalEaten - avgBudget : null,
    days_with_logged_training: trainingDaysWithRealCalories,
  }
}
