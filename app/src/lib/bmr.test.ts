import { describe, it, expect } from 'vitest'
import { estimateBMR } from './bmr'

describe('estimateBMR', () => {
  it('matches the Mifflin-St Jeor formula for a fully-specified man', () => {
    // 10*80 + 6.25*180 - 5*35 + 5 = 800 + 1125 - 175 + 5 = 1755
    const result = estimateBMR({ weightKg: 80, heightCm: 180, birthYear: 2026 - 35, biologicalSex: 'male' }, new Date('2026-01-01'))
    expect(result.bmr).toBe(1755)
    expect(result.usedDefaults).toEqual([])
  })

  it('matches the formula for a fully-specified woman', () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25 -> 1320
    const result = estimateBMR({ weightKg: 60, heightCm: 165, birthYear: 2026 - 30, biologicalSex: 'female' }, new Date('2026-01-01'))
    expect(result.bmr).toBe(1320)
    expect(result.usedDefaults).toEqual([])
  })

  it('falls back to population-average defaults and reports which ones were used', () => {
    const result = estimateBMR({ weightKg: null, heightCm: null, birthYear: null, biologicalSex: null })
    expect(result.usedDefaults.sort()).toEqual(['age', 'height', 'sex', 'weight'])
    expect(result.bmr).toBeGreaterThan(0)
  })

  it('only reports defaults for the fields actually missing', () => {
    const result = estimateBMR({ weightKg: 75, heightCm: null, birthYear: 1990, biologicalSex: 'male' }, new Date('2026-01-01'))
    expect(result.usedDefaults).toEqual(['height'])
  })

  it('computes age from birthYear relative to the given date, not real time', () => {
    const young = estimateBMR({ weightKg: 70, heightCm: 175, birthYear: 2000, biologicalSex: 'male' }, new Date('2020-01-01'))
    const old = estimateBMR({ weightKg: 70, heightCm: 175, birthYear: 2000, biologicalSex: 'male' }, new Date('2040-01-01'))
    expect(old.bmr).toBeLessThan(young.bmr)
  })
})
