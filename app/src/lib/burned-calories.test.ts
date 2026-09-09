import { describe, it, expect } from 'vitest'
import { estimateBurnedKcalForDay } from './burned-calories'

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
