import { describe, it, expect } from 'vitest'
import { computeRecoveryData } from './recovery-data'
import type { DayWellness } from '@/lib/garmin-sync'

const TODAY = '2026-09-13'

function day(date: string, overrides: Partial<DayWellness> = {}): DayWellness {
  return {
    date, restingHR: null, sleepHours: null, deepSleepHours: null, remSleepHours: null, lightSleepHours: null,
    steps: null, bodyBattery: null, hrv: null, hrvStatus: null, totalCalories: null, activeCalories: null,
    ...overrides,
  }
}

describe('computeRecoveryData', () => {
  it('averages sleep/steps/body battery over the current window only', () => {
    const history = [
      day('2026-09-13', { sleepHours: 7, steps: 8000, bodyBattery: 70 }),
      day('2026-09-12', { sleepHours: 5, steps: 6000, bodyBattery: 50 }),
      day('2026-09-01', { sleepHours: 1, steps: 100, bodyBattery: 5 }), // well outside a 7-day window
    ]
    const result = computeRecoveryData(history, 9000, 7, TODAY)
    expect(result.sleep_avg_hours).toBe(6)
    expect(result.steps_avg_per_day).toBe(7000)
    expect(result.body_battery_avg).toBe(60)
    expect(result.steps_target_per_day).toBe(9000)
  })

  it('computes the previous period separately from the current one', () => {
    const history = [
      day('2026-09-13', { sleepHours: 8 }),
      day('2026-09-06', { sleepHours: 4 }), // in the prior 7-day window
    ]
    const result = computeRecoveryData(history, 9000, 7, TODAY)
    expect(result.sleep_avg_hours).toBe(8)
    expect(result.sleep_avg_hours_prev_period).toBe(4)
  })

  it('maps resting HR status to a Swedish word, or null when there is not enough baseline data', () => {
    const sparse = [day('2026-09-13', { restingHR: 55 })]
    const result = computeRecoveryData(sparse, 9000, 7, TODAY)
    expect(result.resting_hr_trend).toBeNull()
  })

  it('returns null averages when there is no wellness history at all', () => {
    const result = computeRecoveryData([], 9000, 7, TODAY)
    expect(result.sleep_avg_hours).toBeNull()
    expect(result.steps_avg_per_day).toBeNull()
    expect(result.body_battery_avg).toBeNull()
  })
})
