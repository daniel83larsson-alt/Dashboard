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
import { computeDayCompleteness, kcalTotalForDay, metricTotalForDay, type KostMeal, type KostFoodEntry } from './kost'
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

export type DayProtein = { proteinG: number | null; source: 'yazio' | 'manual' }

// Same YAZIO-wins precedence as resolveDayNutrition, for protein instead of
// kcal — pulled into this shared file rather than a fourth copy (see the
// file header above). A day with no protein recorded reports `null`, not
// 0: metricTotalForDay coalesces a missing protein_g to 0 per entry, which
// would otherwise make a fully-logged day where protein just wasn't typed
// in look like a genuine 0g day and drag an average or a "lowest day" down
// with fake precision (same "null over faked precision" rule as
// weekly-kost.ts's own avgProteinG).
export function resolveDayProteinG(
  dateKey: string,
  yazioByDate: Map<string, YazioDay>,
  manualByDate: Map<string, KostFoodEntry[]>,
  trackedMeals: KostMeal[],
  dayOverrides: Set<string>,
): DayProtein {
  const yazioDay = yazioByDate.get(dateKey)
  if (yazioDay?.kcalEaten != null) return { proteinG: yazioDay.proteinG ?? null, source: 'yazio' }
  const entries = manualByDate.get(dateKey) ?? []
  const completeness = computeDayCompleteness(trackedMeals, entries, dayOverrides.has(dateKey))
  const hasProteinData = entries.some(e => e.protein_g != null)
  if (completeness.status !== 'complete' || !hasProteinData) return { proteinG: null, source: 'manual' }
  return { proteinG: metricTotalForDay(entries, 'protein'), source: 'manual' }
}
