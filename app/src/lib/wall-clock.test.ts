import { describe, it, expect } from 'vitest'
import { activityWallClock, fmtActivityWhen } from './wall-clock'

describe('activityWallClock', () => {
  it('reads Garmin/Concept2 stored clock time as-is (it is already local time)', () => {
    expect(activityWallClock('2026-10-02T09:41:50+00:00', 'garmin')).toEqual({ dateKey: '2026-10-02', time: '09:41' })
    expect(activityWallClock('2026-10-01T18:10:00Z', 'concept2').time).toBe('18:10')
  })
  it('keeps a late-night Garmin pass on its own date', () => {
    expect(activityWallClock('2026-10-01T23:30:00Z', 'garmin')).toEqual({ dateKey: '2026-10-01', time: '23:30' })
  })
  it('converts a true instant to Stockholm time for other sources', () => {
    expect(activityWallClock('2026-10-02T07:41:00Z', 'manual').time).toBe('09:41') // CEST = UTC+2
    expect(activityWallClock('2026-12-02T07:41:00Z', 'manual').time).toBe('08:41') // CET = UTC+1
  })
})

describe('fmtActivityWhen', () => {
  const now = new Date('2026-10-02T14:12:00Z') // 16:12 Stockholm
  it('says Idag / Igår relative to Stockholm today', () => {
    expect(fmtActivityWhen('2026-10-02T09:41:50Z', 'garmin', now)).toBe('Idag kl. 09:41')
    expect(fmtActivityWhen('2026-10-01T19:47:42Z', 'garmin', now)).toBe('Igår kl. 19:47')
  })
  it('uses a date for older passes', () => {
    expect(fmtActivityWhen('2026-09-28T12:00:00Z', 'garmin', now)).toMatch(/^28 sep\.? kl\. 12:00$/)
  })
})
