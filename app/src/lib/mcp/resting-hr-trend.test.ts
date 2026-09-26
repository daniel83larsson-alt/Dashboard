import { describe, it, expect } from 'vitest'
import { computeRestingHrTrend } from './resting-hr-trend'
import type { DayWellness } from '@/lib/garmin-sync'

const TODAY_KEY = '2026-09-20'

function wellnessDay(date: string, restingHR: number | null): DayWellness {
  return { date, restingHR, sleepHours: null, deepSleepHours: null, remSleepHours: null, lightSleepHours: null, steps: null, bodyBattery: null, hrv: null, hrvStatus: null, totalCalories: null, activeCalories: null }
}

describe('computeRestingHrTrend', () => {
  it('produces one point per week, oldest first, ending today', () => {
    const trend = computeRestingHrTrend([], TODAY_KEY, 3)
    expect(trend.period_weeks).toBe(3)
    expect(trend.points.map(p => p.week_end_date)).toEqual([
      '2026-09-06', '2026-09-13', '2026-09-20',
    ])
  })

  it('averages only the readings that fall within each 7-day week window', () => {
    const history = [
      wellnessDay('2026-09-01', 60), // week ending 09-06
      wellnessDay('2026-09-05', 58), // week ending 09-06
      wellnessDay('2026-09-14', 55), // week ending 09-20
      wellnessDay('2026-09-20', 53), // week ending 09-20
    ]
    const trend = computeRestingHrTrend(history, TODAY_KEY, 3)
    expect(trend.points[0].resting_hr_avg).toBe(59) // (60+58)/2
    expect(trend.points[1].resting_hr_avg).toBeNull() // no readings 09-07..09-13
    expect(trend.points[2].resting_hr_avg).toBe(54) // (55+53)/2
  })

  it('reports null for a week with no Garmin data at all', () => {
    const trend = computeRestingHrTrend([], TODAY_KEY, 2)
    expect(trend.points.every(p => p.resting_hr_avg === null)).toBe(true)
  })

  it('ignores readings with a null restingHR value', () => {
    const history = [wellnessDay('2026-09-20', null)]
    const trend = computeRestingHrTrend(history, TODAY_KEY, 1)
    expect(trend.points[0].resting_hr_avg).toBeNull()
  })
})
