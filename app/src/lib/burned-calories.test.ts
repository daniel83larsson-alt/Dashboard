import { describe, it, expect } from 'vitest'
import { estimateBurnedKcalForDay, estimateBurnedKcalForStatus } from './burned-calories'

describe('estimateBurnedKcalForDay', () => {
  it('uses the real Garmin total when known for the day', () => {
    expect(estimateBurnedKcalForDay(1800, 400, 2650)).toEqual({ kcal: 2650, source: 'garmin' })
  })

  it('falls back to BMR + that day\'s training when Garmin is unknown', () => {
    expect(estimateBurnedKcalForDay(1800, 400, null)).toEqual({ kcal: 2200, source: 'estimate' })
  })

  it('falls back to plain BMR on a rest day with no training logged', () => {
    expect(estimateBurnedKcalForDay(1800, 0, null)).toEqual({ kcal: 1800, source: 'estimate' })
  })

  it('rounds a fractional BMR before adding training calories', () => {
    expect(estimateBurnedKcalForDay(1800.4, 100, null)).toEqual({ kcal: 1900, source: 'estimate' })
  })
})

describe('estimateBurnedKcalForStatus', () => {
  it('discounts only the active/training portion of a Garmin day, leaving the resting portion untouched', () => {
    // 2650 total, 850 of which is active — resting = 1800, discounted active = 850*0.75 = 637.5 -> 638
    const kcal = estimateBurnedKcalForStatus(1800, 400, { totalCalories: 2650, activeCalories: 850 }, 0.75)
    expect(kcal).toBe(1800 + 638)
  })

  it('applies no discount when Garmin reports a total but no active/resting split', () => {
    const kcal = estimateBurnedKcalForStatus(1800, 400, { totalCalories: 2650, activeCalories: null }, 0.75)
    expect(kcal).toBe(2650)
  })

  it('discounts the logged-activity fallback the same way when Garmin has no data at all', () => {
    // BMR untouched, activity discounted: 1800 + round(400*0.75) = 1800 + 300
    const kcal = estimateBurnedKcalForStatus(1800, 400, { totalCalories: null, activeCalories: null }, 0.75)
    expect(kcal).toBe(2100)
  })

  it('applies no discount at all on a rest day with no training logged', () => {
    const kcal = estimateBurnedKcalForStatus(1800, 0, { totalCalories: null, activeCalories: null }, 0.75)
    expect(kcal).toBe(1800)
  })

  it('respects a different correction factor per user', () => {
    const kcal = estimateBurnedKcalForStatus(1800, 400, { totalCalories: null, activeCalories: null }, 1)
    expect(kcal).toBe(2200)
  })
})
