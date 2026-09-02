// Which source wins for a given calendar day's "how much did they eat" —
// a synced YAZIO day (with a real kcalEaten value) always wins over the
// manual Kost log for that date, never both summed together. Same
// precedence dashboard/page.tsx's own calorie card already uses.
//
// Pulled out as a shared helper because this exact merge logic was
// starting to drift into three near-identical copies (Viktmål's page,
// the deficit check-in route, and Veckans Recap's deficit line) — Sam's
// note: the original three call sites were written before this existed
// and haven't been migrated to it yet (see STATUS.md); new call sites
// should use this instead of re-deriving it.
import { computeDayCompleteness, kcalTotalForDay, type KostMeal, type KostFoodEntry } from './kost'
import type { YazioDay } from './yazio-history'

export type DayNutrition = { eatenKcal: number; isComplete: boolean; source: 'yazio' | 'manual' }

export function resolveDayNutrition(
  dateKey: string,
  yazioByDate: Map<string, YazioDay>,
  manualByDate: Map<string, KostFoodEntry[]>,
  trackedMeals: KostMeal[],
  dayOverrides: Set<string>,
): DayNutrition {
  const yazioDay = yazioByDate.get(dateKey)
  if (yazioDay?.kcalEaten != null) return { eatenKcal: yazioDay.kcalEaten, isComplete: true, source: 'yazio' }
  const entries = manualByDate.get(dateKey) ?? []
  const completeness = computeDayCompleteness(trackedMeals, entries, dayOverrides.has(dateKey))
  return { eatenKcal: kcalTotalForDay(entries), isComplete: completeness.status === 'complete', source: 'manual' }
}
