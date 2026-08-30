import { describe, it, expect } from 'vitest'
import {
  computeDayCompleteness, kcalTotalForDay, metricTotalForDay, groupEntriesByMeal,
  type KostFoodEntry, type KostMeal,
} from './kost'

function entry(overrides: Partial<KostFoodEntry> = {}): KostFoodEntry {
  return {
    id: crypto.randomUUID(),
    name: 'Test',
    calories: 500,
    protein_g: 20,
    carb_g: 40,
    fat_g: 10,
    meal: 'breakfast',
    source: 'ai_text',
    logged_at: '2026-08-29T08:00:00Z',
    ...overrides,
  }
}

describe('computeDayCompleteness', () => {
  const trackedMeals: KostMeal[] = ['breakfast', 'lunch', 'dinner']

  it('returns complete when a manual override is set, regardless of entries', () => {
    expect(computeDayCompleteness(trackedMeals, [], true)).toEqual({ status: 'complete' })
  })

  it('returns no_data when there are zero entries and no override', () => {
    expect(computeDayCompleteness(trackedMeals, [], false)).toEqual({ status: 'no_data' })
  })

  it('returns incomplete with the missing meals when some tracked meals have no entry', () => {
    const entries = [entry({ meal: 'breakfast' })]
    expect(computeDayCompleteness(trackedMeals, entries, false)).toEqual({
      status: 'incomplete',
      missingMeals: ['lunch', 'dinner'],
    })
  })

  it('returns complete when every tracked meal has at least one entry', () => {
    const entries = [entry({ meal: 'breakfast' }), entry({ meal: 'lunch' }), entry({ meal: 'dinner' })]
    expect(computeDayCompleteness(trackedMeals, entries, false)).toEqual({ status: 'complete' })
  })

  it('does not require multiple entries for snack/supper — one is enough', () => {
    const entries = [
      entry({ meal: 'breakfast' }), entry({ meal: 'lunch' }), entry({ meal: 'dinner' }), entry({ meal: 'snack' }),
    ]
    expect(computeDayCompleteness(['breakfast', 'lunch', 'dinner', 'snack'], entries, false)).toEqual({ status: 'complete' })
  })

  it('ignores untracked meals when deciding completeness', () => {
    const entries = [entry({ meal: 'breakfast' }), entry({ meal: 'lunch' }), entry({ meal: 'dinner' })]
    // snack isn't tracked, so its absence shouldn't matter
    expect(computeDayCompleteness(trackedMeals, entries, false)).toEqual({ status: 'complete' })
  })
})

describe('kcalTotalForDay / metricTotalForDay', () => {
  it('sums calories across all entries', () => {
    const entries = [entry({ calories: 300 }), entry({ calories: 450 })]
    expect(kcalTotalForDay(entries)).toBe(750)
  })

  it('sums protein/carb/fat and treats missing values as zero', () => {
    const entries = [entry({ protein_g: 20, carb_g: null, fat_g: 5 }), entry({ protein_g: null, carb_g: 30, fat_g: null })]
    expect(metricTotalForDay(entries, 'protein')).toBe(20)
    expect(metricTotalForDay(entries, 'carb')).toBe(30)
    expect(metricTotalForDay(entries, 'fat')).toBe(5)
  })
})

describe('groupEntriesByMeal', () => {
  it('groups entries under their meal key, including multiple per key', () => {
    const entries = [
      entry({ meal: 'snack', name: 'Äpple' }),
      entry({ meal: 'snack', name: 'Nötter' }),
      entry({ meal: 'breakfast', name: 'Havregryn' }),
    ]
    const groups = groupEntriesByMeal(entries)
    expect(groups.snack).toHaveLength(2)
    expect(groups.breakfast).toHaveLength(1)
    expect(groups.dinner).toHaveLength(0)
  })

  it('drops entries with no meal set (null) rather than crashing', () => {
    const entries = [entry({ meal: null })]
    const groups = groupEntriesByMeal(entries)
    expect(Object.values(groups).every(g => g.length === 0)).toBe(true)
  })
})
