import { describe, it, expect } from 'vitest'
import { computeWeeklyKost, weekDateKeys } from './weekly-kost'
import type { YazioDay } from './yazio-history'
import type { KostFoodEntry } from './kost'

// Monday 2026-08-24
const WEEK_START = new Date(2026, 7, 24)
const PREV_WEEK_START = new Date(2026, 7, 17)
const TODAY_KEY = '2026-08-30' // Sunday, the week is fully in the past

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

describe('weekDateKeys', () => {
  it('returns the 7 ISO dates for the week starting at weekStart', () => {
    expect(weekDateKeys(WEEK_START)).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30',
    ])
  })
})

describe('computeWeeklyKost', () => {
  const base = {
    weekStart: WEEK_START,
    prevWeekStart: PREV_WEEK_START,
    todayKey: TODAY_KEY,
    trackedMeals: [],
    dayOverrides: new Set<string>(),
    calorieGoal: null,
    proteinGoalG: null,
    carbGoalG: null,
    fatGoalG: null,
  }

  it('returns null when the user has no kost data at all this week (e.g. a pure training user)', () => {
    const result = computeWeeklyKost({ ...base, yazioHistory: [], manualEntries: [] })
    expect(result).toBeNull()
  })

  it('prefers YAZIO when both sources have data this week', () => {
    const yazioHistory = [yazioDay({ date: '2026-08-24', kcalEaten: 2000 })]
    const manualEntries = [foodEntry({ logged_at: '2026-08-25T08:00:00Z' })]
    const result = computeWeeklyKost({ ...base, yazioHistory, manualEntries })
    expect(result?.source).toBe('yazio')
  })

  it('computes avgKcal, goal adherence, and macros from YAZIO history for a pure-nutrition user (Rawa-like)', () => {
    const yazioHistory = [
      yazioDay({ date: '2026-08-24', kcalEaten: 2000, kcalGoal: 2200, proteinG: 100, carbG: 200, fatG: 60, weightKg: 90 }),
      yazioDay({ date: '2026-08-25', kcalEaten: 2500, kcalGoal: 2200, proteinG: 90, carbG: 250, fatG: 80, weightKg: 89.5 }),
      yazioDay({ date: '2026-08-26', kcalEaten: 1900, kcalGoal: 2200, proteinG: 110, carbG: 190, fatG: 55 }),
    ]
    const result = computeWeeklyKost({ ...base, yazioHistory, manualEntries: [] })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('yazio')
    expect(result!.daysWithData).toBe(3)
    expect(result!.avgKcal).toBeCloseTo((2000 + 2500 + 1900) / 3)
    expect(result!.daysWithinKcalGoal).toBe(2) // 2000 and 1900 are <= 2200, 2500 is not
    expect(result!.weightStartKg).toBe(90)
    expect(result!.weightEndKg).toBe(89.5)
  })

  it('flags past days this week with no logged data, but never counts future days as flagged', () => {
    const yazioHistory = [yazioDay({ date: '2026-08-24', kcalEaten: 2000 })]
    // todayKey is the last day of the week (Sunday), so all 7 days are "past" —
    // 1 has data, the other 6 should be flagged.
    const result = computeWeeklyKost({ ...base, yazioHistory, manualEntries: [] })
    expect(result!.daysFlagged).toBe(6)
  })

  it('does not flag days beyond todayKey (mid-week digest generation)', () => {
    const yazioHistory = [yazioDay({ date: '2026-08-24', kcalEaten: 2000 })]
    const result = computeWeeklyKost({ ...base, yazioHistory, manualEntries: [], todayKey: '2026-08-25' })
    // Only Mon (has data) and Tue (past, no data) have happened yet — 1 flagged, not 6.
    expect(result!.daysFlagged).toBe(1)
  })

  it('computes manual Kost totals using the same completeness rule as the Kost page', () => {
    const manualEntries = [
      foodEntry({ logged_at: '2026-08-24T07:00:00Z', meal: 'breakfast', calories: 400, protein_g: 20 }),
      foodEntry({ logged_at: '2026-08-24T12:00:00Z', meal: 'lunch', calories: 600, protein_g: 30 }),
      foodEntry({ logged_at: '2026-08-25T07:00:00Z', meal: 'breakfast', calories: 350, protein_g: 15 }),
    ]
    const result = computeWeeklyKost({
      ...base, yazioHistory: [], manualEntries, trackedMeals: ['breakfast', 'lunch', 'dinner'],
    })
    expect(result!.source).toBe('manual')
    expect(result!.daysWithData).toBe(2)
    expect(result!.avgKcal).toBeCloseTo((1000 + 350) / 2)
    // todayKey is the week's Sunday, so all 7 days are "past": 2 days logged
    // but incomplete (missing dinner), and the other 5 days have zero data —
    // all 7 count as flagged.
    expect(result!.daysFlagged).toBe(7)
  })

  it('detects a consistently skipped meal across the week', () => {
    const manualEntries = [
      foodEntry({ logged_at: '2026-08-24T07:00:00Z', meal: 'breakfast' }),
      foodEntry({ logged_at: '2026-08-24T12:00:00Z', meal: 'lunch' }),
      foodEntry({ logged_at: '2026-08-25T07:00:00Z', meal: 'breakfast' }),
      foodEntry({ logged_at: '2026-08-25T12:00:00Z', meal: 'lunch' }),
      foodEntry({ logged_at: '2026-08-26T07:00:00Z', meal: 'breakfast' }),
      foodEntry({ logged_at: '2026-08-26T12:00:00Z', meal: 'lunch' }),
    ]
    const result = computeWeeklyKost({
      ...base, yazioHistory: [], manualEntries, trackedMeals: ['breakfast', 'lunch', 'dinner'],
    })
    expect(result!.mostSkippedMeal).toBe('Middag')
  })

  // Regression test for a real bug caught by feeding an actual account's
  // stored YAZIO history through this function before shipping: YAZIO's API
  // always returns a PRESENT meal object even for a meal nothing was eaten
  // at (kcal: 0) — it never omits the key or sets it to null. The original
  // "missed" check only tested for null/undefined, so it silently never
  // flagged anything for any real YAZIO user, ever.
  it('treats a present meal object with kcal 0 as skipped, not just a null/missing meal', () => {
    const zeroKcalMeal = { kcal: 0, kcalGoal: 463, carbG: 0, fatG: 0, proteinG: 0 }
    const yazioHistory = [
      yazioDay({ date: '2026-08-24', kcalEaten: 300, meals: { breakfast: { kcal: 300, kcalGoal: 555, carbG: 20, fatG: 5, proteinG: 20 }, lunch: null, dinner: zeroKcalMeal, snack: zeroKcalMeal } }),
      yazioDay({ date: '2026-08-25', kcalEaten: 250, meals: { breakfast: { kcal: 250, kcalGoal: 555, carbG: 15, fatG: 5, proteinG: 15 }, lunch: null, dinner: zeroKcalMeal, snack: zeroKcalMeal } }),
      yazioDay({ date: '2026-08-26', kcalEaten: 400, meals: { breakfast: { kcal: 200, kcalGoal: 555, carbG: 10, fatG: 5, proteinG: 10 }, lunch: { kcal: 200, kcalGoal: 740, carbG: 20, fatG: 5, proteinG: 10 }, dinner: zeroKcalMeal, snack: zeroKcalMeal } }),
    ]
    const result = computeWeeklyKost({ ...base, yazioHistory, manualEntries: [] })
    expect(result!.mostSkippedMeal).toBe('Middag')
  })

  it('respects a manual day-status override when deciding flagged days', () => {
    const manualEntries = [foodEntry({ logged_at: '2026-08-24T07:00:00Z', meal: 'breakfast' })]
    const withoutOverride = computeWeeklyKost({ ...base, yazioHistory: [], manualEntries, trackedMeals: ['breakfast', 'lunch'] })
    const withOverride = computeWeeklyKost({
      ...base, yazioHistory: [], manualEntries, trackedMeals: ['breakfast', 'lunch'], dayOverrides: new Set(['2026-08-24']),
    })
    expect(withoutOverride!.daysFlagged).toBeGreaterThan(withOverride!.daysFlagged)
  })
})
