import { describe, it, expect } from 'vitest'
import { startOfWeek, stockholmDateKey, stockholmDayElapsedFraction, relativeDateLabel } from './dates'

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

describe('relativeDateLabel', () => {
  const now = new Date('2026-07-13T18:00:00Z') // 20:00 Stockholm summer time

  it('labels the same Swedish-local day as "Idag"', () => {
    expect(relativeDateLabel('2026-07-13T05:00:00Z', now)).toBe('Idag')
  })

  it('labels the previous Swedish-local day as "Igår"', () => {
    expect(relativeDateLabel('2026-07-12T20:00:00Z', now)).toBe('Igår')
  })

  it('falls back to a full date further back', () => {
    const label = relativeDateLabel('2026-07-01T12:00:00Z', now)
    expect(label).not.toBe('Idag')
    expect(label).not.toBe('Igår')
    expect(label).toMatch(/2026/)
  })

  it('uses the Swedish-local calendar day, not the UTC one, near midnight', () => {
    // 2026-07-13 23:30 UTC is already 2026-07-14 01:30 Stockholm time —
    // still "Idag" relative to a `now` on the 14th, even though the raw
    // UTC date string still says the 13th.
    const lateNow = new Date('2026-07-13T23:30:00Z')
    expect(relativeDateLabel('2026-07-13T23:00:00Z', lateNow)).toBe('Idag')
  })
})
