import { describe, it, expect } from 'vitest'
import { startOfWeek, stockholmDateKey, stockholmDayElapsedFraction } from './dates'

describe('startOfWeek', () => {
  it('returns the same Monday for every day in that week', () => {
    // 2026-07-13 is a Monday (matches the real week used throughout this
    // session's weekly-plan work).
    const monday = new Date('2026-07-13T12:00:00')
    const wednesday = new Date('2026-07-15T23:00:00')
    const sunday = new Date('2026-07-19T00:30:00')
    expect(startOfWeek(monday).toDateString()).toBe(new Date('2026-07-13').toDateString())
    expect(startOfWeek(wednesday).toDateString()).toBe(new Date('2026-07-13').toDateString())
    expect(startOfWeek(sunday).toDateString()).toBe(new Date('2026-07-13').toDateString())
  })

  it('zeroes the time of day', () => {
    const result = startOfWeek(new Date('2026-07-15T14:37:22'))
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })

  it('crosses a month boundary correctly', () => {
    // 2026-08-01 is a Saturday; its Monday is 2026-07-27.
    const result = startOfWeek(new Date('2026-08-01'))
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-27')
  })
})

describe('stockholmDateKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(stockholmDateKey(new Date('2026-07-13T10:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('rolls over near local midnight independent of UTC date', () => {
    // 23:30 Stockholm summer time (UTC+2) on 2026-07-13 is 21:30 UTC —
    // still the 13th locally even though it's getting late.
    const late = new Date('2026-07-13T21:30:00Z')
    expect(stockholmDateKey(late)).toBe('2026-07-13')
  })
})

describe('stockholmDayElapsedFraction', () => {
  it('returns a value between 0 and 1', () => {
    const frac = stockholmDayElapsedFraction(new Date())
    expect(frac).toBeGreaterThanOrEqual(0)
    expect(frac).toBeLessThanOrEqual(1)
  })

  it('increases later in the day', () => {
    const morning = stockholmDayElapsedFraction(new Date('2026-07-13T06:00:00Z'))
    const evening = stockholmDayElapsedFraction(new Date('2026-07-13T18:00:00Z'))
    expect(evening).toBeGreaterThan(morning)
  })
})
