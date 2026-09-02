import { describe, it, expect } from 'vitest'
import { buildNutritionSummary, formatNutritionForPrompt, GENERAL_WINDOW_DAYS } from './nutrition-summary'
import type { YazioDay } from './yazio-history'
import type { KostFoodEntry } from './kost'

// Sunday 2026-08-30 — same anchor weekly-kost.test.ts uses, so "this week"
// lines up with a fully-past Monday..Sunday window.
const NOW = new Date(2026, 7, 30, 12, 0, 0)
const TODAY_KEY = '2026-08-30'

function yazioDay(overrides: Partial<YazioDay> & { date: string }): YazioDay {
  return {
    kcalEaten: null, kcalGoal: null, proteinG: null, proteinGoalG: null, carbG: null, fatG: null,
    steps: null, weightKg: null, startWeightKg: null, weightGoal: null, waterMl: null, waterGoalMl: null,
    activityKcal: null, fastingTemplate: null,
    meals: { breakfast: null, lunch: null, dinner: null, snack: null },
    ...overrides,
  }
}

function foodEntry(overrides: Partial<KostFoodEntry> = {}): KostFoodEntry {
  return {
    id: crypto.randomUUID(), name: 'Test', calories: 500, protein_g: 20, carb_g: 40, fat_g: 10,
    meal: 'breakfast', source: 'ai_text', logged_at: '2026-08-24T08:00:00Z',
    ...overrides,
  }
}

const base = {
  now: NOW,
  todayKey: TODAY_KEY,
  trackedMeals: [] as ('breakfast' | 'lunch' | 'dinner' | 'supper' | 'snack')[],
  dayOverrides: new Set<string>(),
  calorieGoal: null,
  proteinGoalG: null,
  carbGoalG: null,
  fatGoalG: null,
  deficitEnabled: false,
  deficitBudgetKcal: null,
}

describe('buildNutritionSummary', () => {
  it('hasData is false and week is null for a pure training user with no kost data at all', () => {
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries: [] })
    expect(s.hasData).toBe(false)
    expect(s.week).toBeNull()
    expect(s.generalDaysLogged).toBe(0)
    expect(s.generalAvgKcal).toBeNull()
  })

  it('picks up manual Kost logging for both the week and the general window', () => {
    const manualEntries = [
      foodEntry({ logged_at: '2026-08-24T08:00:00Z', calories: 600 }), // this week (Mon)
      foodEntry({ logged_at: '2026-08-10T08:00:00Z', calories: 400 }), // earlier in the 30-day window
    ]
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries })
    expect(s.hasData).toBe(true)
    expect(s.week).not.toBeNull()
    expect(s.generalDaysLogged).toBeGreaterThanOrEqual(1)
    expect(s.generalAvgKcal).not.toBeNull()
  })

  it('only counts general-window days within GENERAL_WINDOW_DAYS back from today', () => {
    const tooOld = foodEntry({ logged_at: '2026-01-01T08:00:00Z', calories: 999 })
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries: [tooOld] })
    expect(s.generalDaysLogged).toBe(0)
    expect(s.generalWindowDays).toBe(GENERAL_WINDOW_DAYS)
  })

  it('computes a Viktmål 7-day average diff only when deficit tracking is enabled', () => {
    const manualEntries = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2026, 7, 30 - i)
      return foodEntry({ logged_at: `${d.toISOString().slice(0, 10)}T08:00:00Z`, calories: 2500, meal: 'breakfast' })
    })
    const withDeficit = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries, deficitEnabled: true, deficitBudgetKcal: 2200 })
    // trackedMeals is [] in `base` — computeDayCompleteness has nothing to
    // require, so a single entry per day is enough to mark it complete.
    expect(withDeficit.generalDeficitAvgDiffKcal).not.toBeNull()

    const withoutDeficit = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries, deficitEnabled: false, deficitBudgetKcal: 2200 })
    expect(withoutDeficit.generalDeficitAvgDiffKcal).toBeNull()
  })

  it('computes a weight change from YAZIO history within the window, ignoring points outside it', () => {
    const yazioHistory = [
      yazioDay({ date: '2026-08-01', kcalEaten: 2000, weightKg: 90 }),
      yazioDay({ date: '2026-08-30', kcalEaten: 2000, weightKg: 88.5 }),
      yazioDay({ date: '2026-01-01', kcalEaten: 2000, weightKg: 100 }), // outside the 30-day window
    ]
    const s = buildNutritionSummary({ ...base, yazioHistory, manualEntries: [] })
    expect(s.weightChangeKg).toBe(-1.5)
  })

  it('does not compute a weight change from a single data point', () => {
    const yazioHistory = [yazioDay({ date: '2026-08-30', kcalEaten: 2000, weightKg: 88.5 })]
    const s = buildNutritionSummary({ ...base, yazioHistory, manualEntries: [] })
    expect(s.weightChangeKg).toBeNull()
  })
})

describe('formatNutritionForPrompt', () => {
  it('returns a friendly no-data line when hasData is false', () => {
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries: [] })
    expect(formatNutritionForPrompt(s)).toContain('Ingen kostloggning')
  })

  it('includes week, general-window and Viktmål lines when all three have data', () => {
    const manualEntries = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2026, 7, 30 - i)
      return foodEntry({ logged_at: `${d.toISOString().slice(0, 10)}T08:00:00Z`, calories: 2500, meal: 'breakfast' })
    })
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries, deficitEnabled: true, deficitBudgetKcal: 2200 })
    const text = formatNutritionForPrompt(s)
    expect(text).toContain('DENNA VECKA')
    expect(text).toContain('SENASTE 30 DAGARNA')
    expect(text).toContain('VIKTMÅL')
  })
})
