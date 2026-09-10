import { describe, it, expect } from 'vitest'
import { buildNutritionSummary, formatNutritionForPrompt, GENERAL_WINDOW_DAYS } from './nutrition-summary'
import type { KostFoodEntry } from './kost'

// Sunday 2026-08-30 — same anchor weekly-kost.test.ts uses, so "this week"
// lines up with a fully-past Monday..Sunday window.
const NOW = new Date(2026, 7, 30, 12, 0, 0)
const TODAY_KEY = '2026-08-30'

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
  bodyMeasurements: [] as { measured_on: string; weight_kg: number | null; waist_cm: number | null }[],
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

  it('computes a weight change from body_measurements within the window, ignoring points outside it', () => {
    const bodyMeasurements = [
      { measured_on: '2026-08-01', weight_kg: 90, waist_cm: null },
      { measured_on: '2026-08-30', weight_kg: 88.5, waist_cm: null },
      { measured_on: '2026-01-01', weight_kg: 100, waist_cm: null }, // outside the 30-day window
    ]
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries: [], bodyMeasurements })
    expect(s.weightChangeKg).toBe(-1.5)
  })

  it('does not compute a weight change from a single data point', () => {
    const bodyMeasurements = [{ measured_on: '2026-08-30', weight_kg: 88.5, waist_cm: null }]
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries: [], bodyMeasurements })
    expect(s.weightChangeKg).toBeNull()
  })

  it('computes a weight change for a manual (non-YAZIO) user from the same shared body_measurements table', () => {
    // Daniel: doesn't use YAZIO at all, only logs weight/waist manually via
    // Viktmål — this must not silently be YAZIO-only.
    const bodyMeasurements = [
      { measured_on: '2026-08-05', weight_kg: 92, waist_cm: null },
      { measured_on: '2026-08-29', weight_kg: 90.5, waist_cm: null },
    ]
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries: [], bodyMeasurements })
    expect(s.weightChangeKg).toBe(-1.5)
  })

  it('computes a waist change independently of weight', () => {
    const bodyMeasurements = [
      { measured_on: '2026-08-05', weight_kg: null, waist_cm: 92 },
      { measured_on: '2026-08-29', weight_kg: null, waist_cm: 90 },
    ]
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries: [], bodyMeasurements })
    expect(s.waistChangeCm).toBe(-2)
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

  it('formats a combined KROPPSMÅTT line with both weight and waist when both are known', () => {
    const manualEntries = [foodEntry({ logged_at: '2026-08-24T08:00:00Z', calories: 2500 })]
    const bodyMeasurements = [
      { measured_on: '2026-08-05', weight_kg: 92, waist_cm: 92 },
      { measured_on: '2026-08-29', weight_kg: 90.5, waist_cm: 90 },
    ]
    const s = buildNutritionSummary({ ...base, yazioHistory: [], manualEntries, bodyMeasurements })
    const text = formatNutritionForPrompt(s)
    expect(text).toContain('KROPPSMÅTT (30 dagar): vikt -1.5 kg, midjemått -2 cm')
  })

  it('never presents the not-yet-happened rest of the week as missing data (Daniel: reviewed on a Wednesday should judge Mon-Wed, not get diluted by a still-future Thu-Sun)', () => {
    // Wednesday of the same Mon-Sun week as the other fixtures.
    const wednesday = new Date(2026, 7, 26, 12, 0, 0)
    const wednesdayKey = '2026-08-26'
    const manualEntries = [
      foodEntry({ logged_at: '2026-08-24T08:00:00Z', calories: 2800 }), // Mon
      foodEntry({ logged_at: '2026-08-25T08:00:00Z', calories: 2900 }), // Tue
      foodEntry({ logged_at: '2026-08-26T08:00:00Z', calories: 2700 }), // Wed (today)
    ]
    const s = buildNutritionSummary({ ...base, now: wednesday, todayKey: wednesdayKey, yazioHistory: [], manualEntries })
    expect(s.weekDaysElapsed).toBe(3)
    expect(s.week?.daysWithData).toBe(3)

    const text = formatNutritionForPrompt(s)
    // The denominator must be the 3 days that have actually happened, never
    // a bare "/7" that would read as 4 missing days.
    expect(text).toContain('3 av 7 dagar har hänt')
    expect(text).toContain('3/3 dagar loggade')
    expect(text).not.toContain('3/7 dagar loggade')
    expect(text).toContain('kommande dagar i veckan har inte hänt än')
  })
})
