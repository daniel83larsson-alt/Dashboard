import { describe, it, expect } from 'vitest'
import {
  recapMonthStart, monthDateKeys, monthlySessionStats, monthlyWeightSummary,
  monthlyHabitSummary, monthlyFunFacts, summarizeMonthlyKost,
} from './monthly-report'
import type { ActivityRow } from './duplicates'

function act(overrides: Partial<ActivityRow> & { start_date: string }): ActivityRow {
  return {
    id: overrides.id ?? Math.random().toString(),
    strava_id: 1,
    sport_type: 'Rowing',
    distance: 5000,
    moving_time: 1200,
    ...overrides,
  }
}

describe('recapMonthStart', () => {
  it('returns the 1st of the previous month regardless of day-of-month', () => {
    expect(recapMonthStart(new Date('2026-09-15T12:00:00Z')).toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(recapMonthStart(new Date('2026-09-01T00:00:01Z')).toISOString().slice(0, 10)).toBe('2026-08-01')
  })
  it('rolls back across a year boundary', () => {
    expect(recapMonthStart(new Date('2026-01-10T12:00:00Z')).toISOString().slice(0, 10)).toBe('2025-12-01')
  })
})

describe('monthDateKeys', () => {
  it('covers every day of a 30-day month', () => {
    const keys = monthDateKeys(new Date('2026-09-01T00:00:00'))
    expect(keys.length).toBe(30)
    expect(keys[0]).toBe('2026-09-01')
    expect(keys[29]).toBe('2026-09-30')
  })
  it('covers a leap-year February', () => {
    expect(monthDateKeys(new Date('2028-02-01T00:00:00')).length).toBe(29)
  })
})

describe('monthlySessionStats', () => {
  it('aggregates count, distance and time by sport', () => {
    const stats = monthlySessionStats([
      act({ start_date: '2026-09-01T08:00:00Z', sport_type: 'Rowing', distance: 5000, moving_time: 1200 }),
      act({ start_date: '2026-09-05T08:00:00Z', sport_type: 'Rowing', distance: 6000, moving_time: 1500 }),
      act({ start_date: '2026-09-10T08:00:00Z', sport_type: 'Run', distance: 8000, moving_time: 2400 }),
    ])
    expect(stats.count).toBe(3)
    expect(stats.totalKm).toBe(19)
    expect(stats.bySport[0]).toMatchObject({ sport: 'Rowing', count: 2, km: 11 })
  })
  it('returns zeroed stats for no activities', () => {
    const stats = monthlySessionStats([])
    expect(stats).toEqual({ count: 0, totalKm: 0, totalMinutes: 0, bySport: [] })
  })
})

describe('monthlyWeightSummary', () => {
  it('computes start/end and change from sorted readings', () => {
    const summary = monthlyWeightSummary([
      { date: '2026-09-15', weightKg: 90 },
      { date: '2026-09-01', weightKg: 92 },
      { date: '2026-09-28', weightKg: 89.5 },
    ])
    expect(summary).toEqual({ startKg: 92, endKg: 89.5, changeKg: -2.5, readingsCount: 3 })
  })
  it('returns nulls when there are no readings this month', () => {
    expect(monthlyWeightSummary([])).toEqual({ startKg: null, endKg: null, changeKg: null, readingsCount: 0 })
  })
})

describe('monthlyHabitSummary', () => {
  it('counts distinct done_dates per habit within the month, dropping untouched habits', () => {
    const monthKeys = ['2026-09-01', '2026-09-02', '2026-09-03']
    const result = monthlyHabitSummary(
      [{ id: 'a', title: 'Kreatin' }, { id: 'b', title: 'Stretching' }],
      [
        { habit_id: 'a', done_date: '2026-09-01' },
        { habit_id: 'a', done_date: '2026-09-02' },
        { habit_id: 'a', done_date: '2026-08-31' }, // outside month, ignored
        { habit_id: 'b', done_date: '2026-08-15' }, // outside month entirely
      ],
      monthKeys,
    )
    expect(result).toEqual([{ title: 'Kreatin', doneDays: 2 }])
  })
})

describe('monthlyFunFacts', () => {
  it('finds the longest session and most active weekday', () => {
    const facts = monthlyFunFacts([
      act({ start_date: '2026-09-07T08:00:00Z', distance: 5000, moving_time: 1200 }), // Monday
      act({ start_date: '2026-09-14T08:00:00Z', distance: 15000, moving_time: 3000 }), // Monday
      act({ start_date: '2026-09-09T08:00:00Z', distance: 3000, moving_time: 900 }), // Wednesday
    ])
    expect(facts.longestSessionKm).toBe(15)
    expect(facts.mostActiveWeekday).toBe('Måndag')
    expect(facts.totalActiveMinutes).toBe(85)
  })
  it('returns nulls for an empty month', () => {
    expect(monthlyFunFacts([])).toEqual({ totalActiveMinutes: 0, longestSessionKm: null, mostActiveWeekday: null })
  })
})

describe('summarizeMonthlyKost', () => {
  it('averages only complete-logged days', () => {
    const result = summarizeMonthlyKost(
      [
        { eatenKcal: 2000, isComplete: true, source: 'manual' },
        { eatenKcal: 500, isComplete: false, source: 'manual' }, // incomplete, excluded
        null,
      ],
      [{ proteinG: 150, source: 'manual' }, { proteinG: null, source: 'manual' }, null],
      2200,
      160,
    )
    expect(result).toEqual({ daysWithData: 1, totalDaysInMonth: 3, avgKcal: 2000, kcalGoal: 2200, avgProteinG: 150, proteinGoalG: 160 })
  })
  it('returns null when nothing was logged all month', () => {
    expect(summarizeMonthlyKost([null, null], [null, null], 2200, 160)).toBeNull()
  })
})
