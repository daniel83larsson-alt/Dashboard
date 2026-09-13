// Pure: builds get_weekly_summary()'s exact JSON payload from already-
// fetched data (lib/mcp/fetch-user-data.ts). No I/O here, same contract as
// the rest of this app's lib/ modules.
import { computeAvgDiffVsTdee, computeRollingWeightAverage, tdeeInForceOn, type BudgetEvent } from '@/lib/deficit'
import { resolveEffectiveCalorieGoal } from '@/lib/calorie-goal'
import { resolveDayNutrition, resolveDayProteinG } from '@/lib/day-nutrition-source'
import { dateKeysEndingToday } from './window'
import type { McpUserData } from './fetch-user-data'

const SUMMARY_WINDOW_DAYS = 7

export type WeeklySummary = {
  period: string
  kcal_diff_avg_7d: number | null
  kcal_diff_target: number | null
  days_logged: number
  days_total: number
  protein_avg_7d_g: number | null
  weight_start_kg: number | null
  weight_current_kg: number | null
  weight_avg_of_last_n: { n: number; avg_kg: number | null }
  waist_last_cm: number | null
  waist_change_since_start_cm: number | null
  tdee_kcal: number | null
  budget_kcal: number | null
}

export function computeWeeklySummary(data: McpUserData, todayKey: string, budgetEvents: BudgetEvent[] = []): WeeklySummary {
  const { profile, yazioByDate, manualByDate, dayOverrides, trackedMeals, measurements } = data
  const days = dateKeysEndingToday(todayKey, SUMMARY_WINDOW_DAYS)

  const tdeeKcal = profile?.deficit_tdee_kcal ?? null
  const effectiveGoal = resolveEffectiveCalorieGoal({
    dailyCalorieGoal: profile?.daily_calorie_goal ?? null,
    deficitTrackingEnabled: profile?.deficit_tracking_enabled ?? false,
    deficitBudgetKcal: profile?.deficit_budget_kcal ?? null,
  })
  const budgetKcal = effectiveGoal.kcal

  const dayEntries = days.map(dateKey => resolveDayNutrition(dateKey, yazioByDate, manualByDate, trackedMeals, dayOverrides))
  // Direct eaten-vs-TDEE average, each day against its own historically-
  // correct TDEE (tdeeInForceOn) rather than today's current one — a
  // budget/TDEE change mid-week must not retroactively change how an
  // already-passed day is judged (see lib/deficit.ts's
  // computeAvgDiffVsTdee for why the old "convert via subtraction" trick
  // broke once TDEE could vary within the window). Negative means a
  // deficit, matching the JSON example (-469).
  const tdeeAvg = tdeeKcal != null
    ? computeAvgDiffVsTdee(dayEntries.map((d, i) => ({
        eatenKcal: d.eatenKcal,
        isComplete: d.isComplete,
        tdeeKcal: tdeeInForceOn(days[i], tdeeKcal, budgetEvents),
      })))
    : { avgDiffKcal: null, completeDays: dayEntries.filter(d => d.isComplete).length, incompleteDays: 0 }

  const kcalDiffAvg7d = tdeeAvg.avgDiffKcal
  const kcalDiffTarget = budgetKcal != null && tdeeKcal != null ? budgetKcal - tdeeKcal : null

  const proteinDays = days
    .map(dateKey => resolveDayProteinG(dateKey, yazioByDate, manualByDate, trackedMeals, dayOverrides).proteinG)
    .filter((g): g is number => g != null)
  const proteinAvg7dG = proteinDays.length ? Math.round(proteinDays.reduce((s, g) => s + g, 0) / proteinDays.length) : null

  // Sorted explicitly rather than trusting the caller's order — same
  // defensive re-sort ViktmalClient.tsx does before reading first/last.
  const weighIns = measurements
    .filter((m): m is typeof m & { weightKg: number } => m.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const waistPoints = measurements
    .filter((m): m is typeof m & { waistCm: number } => m.waistCm != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const rollingWeight = computeRollingWeightAverage(weighIns.map(m => ({ date: m.date, weightKg: m.weightKg })), todayKey)
  const weightCurrentKg = weighIns.length ? weighIns[weighIns.length - 1].weightKg : (profile?.deficit_start_weight_kg ?? null)
  const waistLastCm = waistPoints.length ? waistPoints[waistPoints.length - 1].waistCm : null
  // measurements is already scoped to >= deficit_start_date by the fetch
  // layer, so the earliest entry here already IS "the first waist
  // measurement on/after the goal's start date" — no separate lookup needed.
  const waistChangeSinceStartCm = waistPoints.length >= 2
    ? Math.round((waistPoints[waistPoints.length - 1].waistCm - waistPoints[0].waistCm) * 10) / 10
    : null

  return {
    period: `${days[0]} till ${days[days.length - 1]}`,
    kcal_diff_avg_7d: kcalDiffAvg7d,
    kcal_diff_target: kcalDiffTarget,
    days_logged: tdeeAvg.completeDays,
    days_total: SUMMARY_WINDOW_DAYS,
    protein_avg_7d_g: proteinAvg7dG,
    weight_start_kg: profile?.deficit_start_weight_kg ?? null,
    weight_current_kg: weightCurrentKg,
    weight_avg_of_last_n: { n: rollingWeight.readings, avg_kg: rollingWeight.avgKg },
    waist_last_cm: waistLastCm,
    waist_change_since_start_cm: waistChangeSinceStartCm,
    tdee_kcal: tdeeKcal,
    budget_kcal: budgetKcal,
  }
}
