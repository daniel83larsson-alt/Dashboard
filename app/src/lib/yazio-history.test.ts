import { describe, it, expect } from 'vitest'
import { currentWeekDateKeys, normalizeYazioDay, daysMetGoal } from './yazio-history'

describe('currentWeekDateKeys', () => {
  it('returns Monday–Sunday for a mid-week date', () => {
    // 2026-08-23 is a Sunday
    expect(currentWeekDateKeys('2026-08-19')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
      '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  it('treats Sunday as the last day of its own week, not the next Monday', () => {
    expect(currentWeekDateKeys('2026-08-23')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
      '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  it('handles a month boundary correctly', () => {
    // 2026-03-02 is a Monday
    expect(currentWeekDateKeys('2026-03-02')).toEqual([
      '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05',
      '2026-03-06', '2026-03-07', '2026-03-08',
    ])
  })
})

describe('normalizeYazioDay backward compat', () => {
  it('fills in missing fields from an old-shape stored row without throwing', () => {
    const old = { date: '2026-08-23', kcalEaten: 1414, kcalGoal: 2326 }
    const normalized = normalizeYazioDay(old)
    expect(normalized.meals).toEqual({ breakfast: null, lunch: null, dinner: null, snack: null })
    expect(normalized.waterMl).toBeNull()
  })
})

describe('daysMetGoal', () => {
  it('counts only days that actually have both eaten and goal figures', () => {
    const days = [
      { date: '1', kcalEaten: 2000, kcalGoal: 2300 } as never,
      { date: '2', kcalEaten: 2500, kcalGoal: 2300 } as never,
      { date: '3', kcalEaten: null, kcalGoal: 2300 } as never,
    ]
    expect(daysMetGoal(days)).toBe(1)
  })
})
