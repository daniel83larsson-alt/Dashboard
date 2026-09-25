import { describe, it, expect } from 'vitest'
import { computeStreakBadge } from './streak-badge'

describe('computeStreakBadge', () => {
  it('starts at the ring tier, fully uncharged, for a fresh or broken streak', () => {
    expect(computeStreakBadge(0)).toEqual({ tier: 'ring', chargePct: 0 })
    expect(computeStreakBadge(1)).toEqual({ tier: 'ring', chargePct: 1 / 25 })
  })

  it('charges the ring tier up to (not including) 25', () => {
    expect(computeStreakBadge(24)).toEqual({ tier: 'ring', chargePct: 24 / 25 })
  })

  it('pops to the medal tier at 25, freshly uncharged', () => {
    expect(computeStreakBadge(25)).toEqual({ tier: 'medal', chargePct: 0 })
  })

  it('charges the medal tier between 25 and 100', () => {
    const badge = computeStreakBadge(55)
    expect(badge.tier).toBe('medal')
    expect(badge.chargePct).toBeCloseTo(30 / 75)
  })

  it('pops to the trophy tier at 100', () => {
    expect(computeStreakBadge(100)).toEqual({ tier: 'trophy', chargePct: 0 })
  })

  it('charges the trophy tier between 100 and 365', () => {
    const badge = computeStreakBadge(232)
    expect(badge.tier).toBe('trophy')
    expect(badge.chargePct).toBeCloseTo(132 / 265)
  })

  it('pops to the crown tier at 365 and stays fully charged beyond it', () => {
    expect(computeStreakBadge(365)).toEqual({ tier: 'crown', chargePct: 1 })
    expect(computeStreakBadge(1000)).toEqual({ tier: 'crown', chargePct: 1 })
  })

  it('treats a negative value the same as zero (defensive, should never happen)', () => {
    expect(computeStreakBadge(-3)).toEqual({ tier: 'ring', chargePct: 0 })
  })
})
