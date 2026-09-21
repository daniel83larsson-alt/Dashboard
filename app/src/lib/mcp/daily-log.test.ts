import { describe, it, expect } from 'vitest'
import { computeDailyLog } from './daily-log'
import type { McpUserData, McpProfile } from './fetch-user-data'
import type { KostFoodEntry } from '@/lib/kost'
import { normalizeYazioDay } from '@/lib/yazio-history'

const DATE = '2026-09-18'

function entry(overrides: Partial<KostFoodEntry> = {}): KostFoodEntry {
  return {
    id: crypto.randomUUID(), name: 'Test', calories: 300, protein_g: 20, carb_g: null, fat_g: null,
    meal: 'breakfast', source: 'ai_text', logged_at: `${DATE}T08:00:00Z`,
    ...overrides,
  }
}

function baseData(overrides: Partial<McpUserData> = {}): McpUserData {
  const profile: McpProfile = {
    deficit_tracking_enabled: true, deficit_start_weight_kg: 108, deficit_start_date: '2026-08-30',
    deficit_target_weight_kg: 85, deficit_target_date: '2027-07-01', deficit_tdee_kcal: 2622,
    deficit_budget_kcal: 2049, daily_calorie_goal: null, protein_goal_g: 180,
    kost_tracked_meals: ['breakfast', 'lunch', 'dinner'], daily_step_goal: 10000,
  }
  return {
    profile, yazioByDate: new Map(), manualByDate: new Map(), dayOverrides: new Set(),
    trackedMeals: ['breakfast', 'lunch', 'dinner'], measurements: [],
    ...overrides,
  }
}

describe('computeDailyLog', () => {
  it('matches Daniel\'s own example: three manually logged meals, complete day', () => {
    const manualByDate = new Map([[DATE, [
      entry({ name: 'Proteingröt', calories: 304, protein_g: 21, meal: 'breakfast', logged_at: `${DATE}T08:00:00Z` }),
      entry({ name: 'Kål- och köttfärsgratäng med ägg och ris', calories: 240, protein_g: 20, meal: 'lunch', logged_at: `${DATE}T12:00:00Z` }),
      entry({ name: 'Kycklingkebab med sallad', calories: 650, protein_g: 69, meal: 'dinner', logged_at: `${DATE}T18:00:00Z` }),
    ]]])
    const log = computeDailyLog(baseData({ manualByDate }), DATE, 'normal')
    expect(log.source).toBe('manual')
    expect(log.is_complete).toBe(true)
    expect(log.kcal_eaten).toBe(304 + 240 + 650)
    expect(log.kcal_budget).toBe(2049)
    expect(log.protein_target_g).toBe(180)
    expect(log.context_tag).toBe('Vanlig dag')
    expect(log.meals).toEqual([
      { name: 'Proteingröt', category: 'Frukost', kcal: 304, protein_g: 21 },
      { name: 'Kål- och köttfärsgratäng med ägg och ris', category: 'Lunch', kcal: 240, protein_g: 20 },
      { name: 'Kycklingkebab med sallad', category: 'Middag', kcal: 650, protein_g: 69 },
    ])
  })

  it('orders meals by meal category, not by when they were logged', () => {
    // Real pattern found in Daniel's own data: a "kvällsmat" (supper) entry
    // logged mid-afternoon, well before that day's actual "middag" (dinner)
    // was typed in — sorting by raw logged_at would put supper before
    // dinner, reading like the day happened backwards.
    const manualByDate = new Map([[DATE, [
      entry({ name: 'Middag', meal: 'dinner', logged_at: `${DATE}T08:00:00Z` }), // logged FIRST...
      entry({ name: 'Frukost', meal: 'breakfast', logged_at: `${DATE}T18:00:00Z` }), // ...but logged LAST
    ]]])
    const log = computeDailyLog(baseData({ manualByDate }), DATE, null)
    expect(log.meals.map(m => m.name)).toEqual(['Frukost', 'Middag'])
  })

  it('sorts multiple entries within the same meal category by logged_at', () => {
    const manualByDate = new Map([[DATE, [
      entry({ name: 'Kvällsmat 2', meal: 'supper', logged_at: `${DATE}T21:00:00Z` }),
      entry({ name: 'Kvällsmat 1', meal: 'supper', logged_at: `${DATE}T20:00:00Z` }),
    ]]])
    const log = computeDailyLog(baseData({ manualByDate }), DATE, null)
    expect(log.meals.map(m => m.name)).toEqual(['Kvällsmat 1', 'Kvällsmat 2'])
  })

  it('reports no_data with an empty meals list when nothing was logged', () => {
    const log = computeDailyLog(baseData(), DATE, null)
    expect(log.source).toBe('no_data')
    expect(log.kcal_eaten).toBeNull()
    expect(log.meals).toEqual([])
    expect(log.context_tag).toBeNull()
  })

  it('translates a non-normal context tag to its Swedish label', () => {
    const log = computeDailyLog(baseData(), DATE, 'sick')
    expect(log.context_tag).toBe('Sjuk')
  })

  it('reads per-meal-category totals from a YAZIO day, with no per-item name', () => {
    const yazioByDate = new Map([[DATE, normalizeYazioDay({
      date: DATE, kcalEaten: 1900, proteinG: 150,
      meals: {
        breakfast: { kcal: 400, kcalGoal: null, carbG: null, fatG: null, proteinG: 30 },
        lunch: { kcal: 700, kcalGoal: null, carbG: null, fatG: null, proteinG: 60 },
        dinner: null, snack: null,
      },
    })]])
    const log = computeDailyLog(baseData({ yazioByDate }), DATE, null)
    expect(log.source).toBe('yazio')
    expect(log.kcal_eaten).toBe(1900)
    expect(log.meals).toEqual([
      { name: null, category: 'Frukost', kcal: 400, protein_g: 30 },
      { name: null, category: 'Lunch', kcal: 700, protein_g: 60 },
    ])
  })

  it('marks a day incomplete when a tracked meal has no entry', () => {
    const manualByDate = new Map([[DATE, [entry({ meal: 'breakfast' })]]])
    const log = computeDailyLog(baseData({ manualByDate }), DATE, null)
    expect(log.is_complete).toBe(false)
  })

  it('falls back to "Okategoriserat" for an entry with no meal set', () => {
    const manualByDate = new Map([[DATE, [entry({ meal: null })]]])
    const log = computeDailyLog(baseData({ manualByDate }), DATE, null)
    expect(log.meals[0].category).toBe('Okategoriserat')
  })
})
