import { describe, it, expect } from 'vitest'
import { resolveDayNutrition } from './day-nutrition-source'
import type { YazioDay } from './yazio-history'
import type { KostFoodEntry } from './kost'

function yazioDay(overrides: Partial<YazioDay> & { date: string }): YazioDay {
  return {
    kcalEaten: null, kcalGoal: null, proteinG: null, proteinGoalG: null, carbG: null, fatG: null,
    steps: null, weightKg: null, startWeightKg: null, weightGoal: null, waterMl: null, waterGoalMl: null,
    activityKcal: null, fastingTemplate: null,
    meals: { breakfast: null, lunch: null, dinner: null, snack: null },
    ...overrides,
  }
}

function entry(overrides: Partial<KostFoodEntry> = {}): KostFoodEntry {
  return {
    id: crypto.randomUUID(), name: 'Test', calories: 500, protein_g: null, carb_g: null, fat_g: null,
    meal: 'breakfast', source: 'ai_text', logged_at: '2026-08-24T08:00:00Z',
    ...overrides,
  }
}

describe('resolveDayNutrition', () => {
  it('prefers a synced YAZIO day with a real kcalEaten value over the manual log', () => {
    const yazioByDate = new Map([['2026-08-24', yazioDay({ date: '2026-08-24', kcalEaten: 2000 })]])
    const manualByDate = new Map([['2026-08-24', [entry({ calories: 999 })]]])
    const result = resolveDayNutrition('2026-08-24', yazioByDate, manualByDate, ['breakfast'], new Set())
    expect(result).toEqual({ eatenKcal: 2000, isComplete: true, source: 'yazio' })
  })

  it('falls back to the manual log when no YAZIO day exists for the date', () => {
    const manualByDate = new Map([['2026-08-24', [entry({ calories: 500, meal: 'breakfast' })]]])
    const result = resolveDayNutrition('2026-08-24', new Map(), manualByDate, ['breakfast'], new Set())
    expect(result).toEqual({ eatenKcal: 500, isComplete: true, source: 'manual' })
  })

  it('falls back to manual when the YAZIO day exists but has no kcalEaten value', () => {
    const yazioByDate = new Map([['2026-08-24', yazioDay({ date: '2026-08-24', kcalEaten: null })]])
    const manualByDate = new Map([['2026-08-24', [entry({ calories: 500, meal: 'breakfast' })]]])
    const result = resolveDayNutrition('2026-08-24', yazioByDate, manualByDate, ['breakfast'], new Set())
    expect(result.source).toBe('manual')
  })

  it('reports incomplete when a tracked meal is missing from the manual log', () => {
    const manualByDate = new Map([['2026-08-24', [entry({ meal: 'breakfast' })]]])
    const result = resolveDayNutrition('2026-08-24', new Map(), manualByDate, ['breakfast', 'lunch'], new Set())
    expect(result.isComplete).toBe(false)
  })

  it('respects a manual day-status override', () => {
    const manualByDate = new Map([['2026-08-24', [entry({ meal: 'breakfast' })]]])
    const result = resolveDayNutrition('2026-08-24', new Map(), manualByDate, ['breakfast', 'lunch'], new Set(['2026-08-24']))
    expect(result.isComplete).toBe(true)
  })

  it('returns zero, incomplete for a day with nothing logged anywhere', () => {
    const result = resolveDayNutrition('2026-08-24', new Map(), new Map(), ['breakfast'], new Set())
    expect(result).toEqual({ eatenKcal: 0, isComplete: false, source: 'manual' })
  })
})
