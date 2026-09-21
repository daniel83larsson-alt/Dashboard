// Pure: builds get_tdee_trend(weeks)'s exact JSON payload — "ger
// TDEE-kurvan separat från viktkurvan". Much simpler than
// lib/training-load-trend.ts's computeTrainingKcalTrend (which isolates
// just the training SLICE of TDEE from real activity data): this just
// reconstructs the actual whole-TDEE value in force at each week's end,
// reusing the exact same tdeeInForceOn history-reconstruction
// get_weekly_summary and get_budget_history already rely on — no
// activities needed at all.
import { tdeeInForceOn, type BudgetEvent } from '@/lib/deficit'

export type TdeeTrendPoint = {
  week_end_date: string // YYYY-MM-DD
  tdee_kcal: number | null // null only when deficit tracking has never produced a TDEE at all
}

export type TdeeTrend = {
  period_weeks: number
  points: TdeeTrendPoint[]
}

export function computeTdeeTrend(
  currentTdeeKcal: number | null,
  budgetEvents: BudgetEvent[],
  todayKey: string,
  weeks: number,
): TdeeTrend {
  const points: TdeeTrendPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(`${todayKey}T00:00:00`)
    weekEnd.setDate(weekEnd.getDate() - i * 7)
    const weekEndKey = weekEnd.toISOString().slice(0, 10)
    points.push({
      week_end_date: weekEndKey,
      tdee_kcal: currentTdeeKcal != null ? tdeeInForceOn(weekEndKey, currentTdeeKcal, budgetEvents) : null,
    })
  }
  return { period_weeks: weeks, points }
}
