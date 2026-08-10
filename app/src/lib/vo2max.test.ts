import { describe, it, expect } from 'vitest'
import { estimateVo2maxFromRun, bestVo2maxEstimate, vo2maxRating } from './vo2max'

describe('estimateVo2maxFromRun', () => {
  it('estimates a plausible value for a solid 5k', () => {
    const value = estimateVo2maxFromRun(5000, 1500) // 25:00
    expect(value).not.toBeNull()
    expect(value!).toBeGreaterThan(30)
    expect(value!).toBeLessThan(60)
  })

  it('rejects efforts shorter than 3 minutes', () => {
    expect(estimateVo2maxFromRun(1500, 179)).toBeNull()
  })

  it('rejects efforts longer than 60 minutes', () => {
    expect(estimateVo2maxFromRun(10000, 3601)).toBeNull()
  })

  it('rejects distances under 1500m', () => {
    expect(estimateVo2maxFromRun(1499, 400)).toBeNull()
  })
})

describe('bestVo2maxEstimate', () => {
  it('picks the highest qualifying estimate within the lookback window', () => {
    const activities = [
      { sport_type: 'Run', distance: 5000, moving_time: 1800, start_date: new Date().toISOString() },
      { sport_type: 'Run', distance: 5000, moving_time: 1500, start_date: new Date().toISOString() },
    ]
    const best = bestVo2maxEstimate(activities, 90)
    expect(best).not.toBeNull()
    expect(best!.vo2max).toBe(estimateVo2maxFromRun(5000, 1500))
  })

  it('ignores non-running sports and stale activities', () => {
    const staleDate = new Date(Date.now() - 200 * 86400000).toISOString()
    const activities = [
      { sport_type: 'Ride', distance: 30000, moving_time: 3000, start_date: new Date().toISOString() },
      { sport_type: 'Run', distance: 5000, moving_time: 1500, start_date: staleDate },
    ]
    expect(bestVo2maxEstimate(activities, 90)).toBeNull()
  })
})

describe('vo2maxRating', () => {
  it('returns null when birth year or sex is missing', () => {
    expect(vo2maxRating(45, null, 'male')).toBeNull()
    expect(vo2maxRating(45, 1990, null)).toBeNull()
  })

  it('rates a strong value for a 30-year-old man as high tier', () => {
    const now = new Date('2026-01-01')
    const rating = vo2maxRating(55, 1996, 'male', now) // age 30, bounds [23,31,39,49,56]
    expect(rating).toEqual({ label: 'Mycket bra', tier: 5 })
  })

  it('rates a low value for the same profile as the bottom tier', () => {
    const now = new Date('2026-01-01')
    const rating = vo2maxRating(20, 1996, 'male', now)
    expect(rating).toEqual({ label: 'Låg', tier: 1 })
  })

  it('uses sex-specific norms — same age and value, different tier for men vs women', () => {
    const now = new Date('2026-01-01')
    const male = vo2maxRating(36, 1996, 'male', now) // bounds [23,31,39,49,56] → tier 3 (Medel)
    const female = vo2maxRating(36, 1996, 'female', now) // bounds [20,28,34,45,53] → tier 4 (Bra)
    expect(male!.tier).toBe(3)
    expect(female!.tier).toBe(4)
  })

  it('clamps ages above the oldest bracket to the 60+ norms', () => {
    const now = new Date('2026-01-01')
    const rating = vo2maxRating(45, 1950, 'male', now) // age 76 → bounds [16,23,31,41,46]
    expect(rating).toEqual({ label: 'Mycket bra', tier: 5 })
  })
})
