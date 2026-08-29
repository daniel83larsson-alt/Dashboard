// Pure logic for the manual-logging side of Kost (goal tracking, meal
// completeness, reminders) — deliberately separate from yazio-history.ts's
// own meal shape (breakfast/lunch/dinner/snack, singular-per-day) since
// YAZIO users don't use any of this: they're synced automatically, opted
// out of tracking/reminders by design (see STATUS.md). Manual logging
// supports a 5th category (kvällsmat/supper) and — unlike YAZIO's meals —
// snack/supper can legitimately have MULTIPLE entries in a day.
export type KostMeal = 'breakfast' | 'lunch' | 'dinner' | 'supper' | 'snack'
export type KostMetric = 'kcal' | 'protein' | 'carb' | 'fat'

export const KOST_MEALS: KostMeal[] = ['breakfast', 'lunch', 'dinner', 'supper', 'snack']
export const KOST_METRICS: KostMetric[] = ['kcal', 'protein', 'carb', 'fat']

const MEAL_LABELS: Record<KostMeal, string> = {
  breakfast: 'Frukost', lunch: 'Lunch', dinner: 'Middag', supper: 'Kvällsmat', snack: 'Mellanmål',
}
export function kostMealLabel(meal: KostMeal): string {
  return MEAL_LABELS[meal]
}

const METRIC_LABELS: Record<KostMetric, string> = {
  kcal: 'Kalorier', protein: 'Protein', carb: 'Kolhydrater', fat: 'Fett',
}
export function kostMetricLabel(metric: KostMetric): string {
  return METRIC_LABELS[metric]
}

// Meals that realistically happen more than once a day — a day only needs
// AT LEAST ONE entry in these categories to count as covered, never
// "exactly one" (real incident this fixes: Daniel pointed out multiple
// snacks/an evening meal are normal, see STATUS.md).
export const MULTI_ENTRY_MEALS: ReadonlySet<KostMeal> = new Set(['snack', 'supper'])

// Reminder time-of-day per meal, Europe/Stockholm local time — snack has no
// fixed slot (by definition flexible/repeatable) so it's never reminded.
export const MEAL_REMINDER_HOUR: Partial<Record<KostMeal, number>> = {
  breakfast: 9, lunch: 13, dinner: 18, supper: 20,
}

export type KostFoodEntry = { id: string; name: string; calories: number; protein_g: number | null; carb_g: number | null; fat_g: number | null; meal: KostMeal | null; source: 'database' | 'ai_text' | 'photo'; logged_at: string }

export type DayCompleteness =
  | { status: 'no_tracking' } // kost_tracking_enabled is off
  | { status: 'future' }
  | { status: 'no_data' } // nothing logged at all that day
  | { status: 'complete' } // every tracked meal has >= 1 entry, or a manual override says so
  | { status: 'incomplete'; missingMeals: KostMeal[] } // some tracked meal(s) have zero entries

// The core "does this day count" rule Daniel asked for: a day only pulls
// down the weekly/monthly average once it's actually complete — otherwise
// it's excluded (and flagged) rather than silently counted as "ate almost
// nothing". A manual override (day_status = 'complete') always wins, so a
// user can confirm "yes I really only ate this much" or "yes, count this
// anyway" without the app second-guessing them forever.
export function computeDayCompleteness(
  trackedMeals: KostMeal[],
  entriesThatDay: KostFoodEntry[],
  hasCompleteOverride: boolean
): DayCompleteness {
  if (hasCompleteOverride) return { status: 'complete' }
  if (entriesThatDay.length === 0) return { status: 'no_data' }
  const missingMeals = trackedMeals.filter(m => !entriesThatDay.some(e => e.meal === m))
  if (missingMeals.length > 0) return { status: 'incomplete', missingMeals }
  return { status: 'complete' }
}

export function kcalTotalForDay(entries: KostFoodEntry[]): number {
  return entries.reduce((s, e) => s + e.calories, 0)
}
export function metricTotalForDay(entries: KostFoodEntry[], metric: KostMetric): number {
  if (metric === 'kcal') return kcalTotalForDay(entries)
  const key = metric === 'protein' ? 'protein_g' : metric === 'carb' ? 'carb_g' : 'fat_g'
  return entries.reduce((s, e) => s + (e[key] ?? 0), 0)
}

// Groups entries by meal type for the "Idag"-style UI — snack/supper keep
// every entry (multi-entry categories), the rest just carry their (normally
// singular) list too, so the UI can render both shapes uniformly.
export function groupEntriesByMeal(entries: KostFoodEntry[]): Record<KostMeal, KostFoodEntry[]> {
  const groups: Record<KostMeal, KostFoodEntry[]> = { breakfast: [], lunch: [], dinner: [], supper: [], snack: [] }
  for (const e of entries) {
    if (e.meal && e.meal in groups) groups[e.meal].push(e)
  }
  return groups
}
