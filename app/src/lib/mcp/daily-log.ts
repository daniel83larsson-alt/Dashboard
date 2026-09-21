// Pure: builds get_daily_log(date)'s exact JSON payload — the highest-
// priority gap Daniel flagged: every other MCP tool only ever sees
// aggregated averages, so there was no way to tell "TDEE is miscalibrated"
// apart from "this one specific day was logged wrong/incomplete".
import { resolveDayNutrition, resolveDayProteinG } from '@/lib/day-nutrition-source'
import { resolveEffectiveCalorieGoal } from '@/lib/calorie-goal'
import { kostMealLabel, KOST_MEALS, type KostMeal } from '@/lib/kost'
import type { McpUserData } from './fetch-user-data'

export type DailyLogMeal = {
  // null for a YAZIO-synced meal — YAZIO only ever gives per-meal-category
  // totals (see lib/yazio-history.ts's YazioMeal), never individual food
  // item names, so this is honestly null rather than invented.
  name: string | null
  category: string
  kcal: number
  protein_g: number | null
}

export type DailyLog = {
  date: string
  source: 'yazio' | 'manual' | 'no_data'
  kcal_eaten: number | null
  kcal_budget: number | null
  protein_g: number | null
  protein_target_g: number | null
  is_complete: boolean
  meals: DailyLogMeal[]
  context_tag: string | null
}

// Same seven values as day_context_notes' own CHECK constraint — 'normal'
// is deliberately reported as a real, named tag ("Vanlig dag") rather than
// null, matching Daniel's own example payload, since a day CAN be
// explicitly tagged normal (not just "never tagged at all").
const CONTEXT_TAG_LABELS: Record<string, string> = {
  normal: 'Vanlig dag', sick: 'Sjuk', social: 'Socialt', travel: 'Resa',
  stress: 'Stress', injury: 'Skada', other: 'Annat',
}

export function computeDailyLog(
  data: McpUserData,
  date: string,
  contextTag: string | null,
): DailyLog {
  const { profile, yazioByDate, manualByDate, dayOverrides, trackedMeals } = data

  const nutrition = resolveDayNutrition(date, yazioByDate, manualByDate, trackedMeals, dayOverrides)
  const protein = resolveDayProteinG(date, yazioByDate, manualByDate, trackedMeals, dayOverrides)
  const effectiveGoal = resolveEffectiveCalorieGoal({
    dailyCalorieGoal: profile?.daily_calorie_goal ?? null,
    deficitTrackingEnabled: profile?.deficit_tracking_enabled ?? false,
    deficitBudgetKcal: profile?.deficit_budget_kcal ?? null,
  })

  const yazioDay = yazioByDate.get(date)
  const manualEntries = manualByDate.get(date) ?? []
  const hasAnyData = (yazioDay?.kcalEaten != null) || manualEntries.length > 0

  let meals: DailyLogMeal[] = []
  if (yazioDay?.kcalEaten != null) {
    const yazioMealOrder: KostMeal[] = ['breakfast', 'lunch', 'dinner', 'snack']
    meals = yazioMealOrder
      .map(meal => ({ meal, m: yazioDay.meals[meal as 'breakfast' | 'lunch' | 'dinner' | 'snack'] }))
      .filter((entry): entry is { meal: KostMeal; m: NonNullable<typeof entry.m> } => entry.m != null)
      .map(({ meal, m }) => ({ name: null, category: kostMealLabel(meal), kcal: m.kcal ?? 0, protein_g: m.proteinG }))
  } else if (manualEntries.length > 0) {
    // Sorted by meal category (Frukost→Lunch→Middag→Kvällsmat→Mellanmål),
    // not raw logged_at — verified against Daniel's own real data that
    // these can genuinely diverge (a kvällsmat entry logged mid-afternoon,
    // well before that day's actual middag was typed in). Category order
    // reads as "the story of the day", timestamp order doesn't.
    meals = [...manualEntries]
      .sort((a, b) => {
        const orderA = a.meal ? KOST_MEALS.indexOf(a.meal) : KOST_MEALS.length
        const orderB = b.meal ? KOST_MEALS.indexOf(b.meal) : KOST_MEALS.length
        return orderA !== orderB ? orderA - orderB : a.logged_at.localeCompare(b.logged_at)
      })
      .map(e => ({
        name: e.name,
        category: e.meal ? kostMealLabel(e.meal) : 'Okategoriserat',
        kcal: e.calories,
        protein_g: e.protein_g,
      }))
  }

  return {
    date,
    source: yazioDay?.kcalEaten != null ? 'yazio' : manualEntries.length > 0 ? 'manual' : 'no_data',
    kcal_eaten: hasAnyData ? nutrition.eatenKcal : null,
    kcal_budget: effectiveGoal.kcal,
    protein_g: protein.proteinG,
    protein_target_g: profile?.protein_goal_g ?? null,
    is_complete: nutrition.isComplete,
    meals,
    context_tag: contextTag != null ? (CONTEXT_TAG_LABELS[contextTag] ?? contextTag) : null,
  }
}
