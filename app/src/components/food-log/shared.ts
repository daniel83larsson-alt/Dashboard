import type { KostMeal, KostMetric, KostFoodEntry } from '@/lib/kost'

// Shared by FoodLogClient and the dialogs split out of it (components/food-log/).

// Same fix as ProfileForm.tsx's copy — native number inputs can silently
// reject a Swedish decimal comma ("1,5"), so decimal fields use type="text"
// and normalize "," to "." themselves before parseFloat.
export function normalizeDecimalInput(raw: string): string {
  return raw.replace(',', '.')
}

export function macroSuffix(e: FoodEntry) {
  return e.protein_g != null ? `${e.protein_g}g protein` : null
}

export function fmtDateLabel(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

export type FoodEntry = KostFoodEntry

export type QuickPick = {
  name: string
  calories: number
  source: 'database' | 'ai_text' | 'photo'
  quantity: number | null
  unit: string | null
  kcal_per_100g: number | null
  off_id: string | null
  protein_g: number | null
  protein_per_100g: number | null
  times_logged: number
  last_logged: string
  pinned: boolean
  edited?: boolean // användaren har ändrat kcal/protein (food_quick_pick_overrides)
}

export type KostSettings = {
  trackingEnabled: boolean
  trackedMetrics: KostMetric[]
  trackedMeals: KostMeal[]
  calorieGoal: number | null
  proteinGoalG: number | null
  proteinGoalMode: 'auto' | 'manual'
  carbGoalG: number | null
  fatGoalG: number | null
  remindersEnabled: boolean
  eveningGuardEnabled: boolean
  eveningGuardHour: number
}

export type DayContextTag = 'normal' | 'sick' | 'social' | 'travel' | 'stress' | 'injury' | 'other'
export type DayNote = { date: string; tag: string | null; note: string | null }

export const DAY_TAGS: { value: DayContextTag; label: string }[] = [
  { value: 'normal', label: 'Vanlig dag' },
  { value: 'sick', label: 'Sjuk' },
  { value: 'social', label: 'Socialt' },
  { value: 'travel', label: 'Resa' },
  { value: 'stress', label: 'Stress' },
  { value: 'injury', label: 'Skada' },
  { value: 'other', label: 'Annat' },
]

export type QuickPickConfirm = { pick: QuickPick; meal: KostMeal; grams: string; multiplier: string; eveningGuard: boolean; kcal: string; protein: string }

export type LogQuickPickOpts = { meal: KostMeal | null; grams?: number; multiplier?: number; replaceEntryId?: string; baseKcal?: number; baseProteinG?: number | null }
