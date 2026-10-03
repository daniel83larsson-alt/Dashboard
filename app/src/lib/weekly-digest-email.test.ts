import { describe, it, expect } from 'vitest'
import { weeklyDigestSubject } from './weekly-digest-email'
import type { WeeklyDigestRecord } from './weekly-digest-generate'

const rec = (count: number, totalMinutes: number) => ({
  weekStartISO: '2026-09-28', weekEndISO: '2026-10-04',
  data: { thisWeek: { sessions: { count, totalMinutes, totalKm: 0, bySport: [] } } },
}) as unknown as WeeklyDigestRecord

describe('weeklyDigestSubject', () => {
  it('visar antal pass och tid när det finns pass', () => {
    expect(weeklyDigestSubject(rec(5, 370))).toBe('Veckans recap: 5 pass, 6 h 10 min')
  })
  it('hela timmar utan minuter, och bara minuter under en timme', () => {
    expect(weeklyDigestSubject(rec(2, 120))).toBe('Veckans recap: 2 pass, 2 h')
    expect(weeklyDigestSubject(rec(1, 45))).toBe('Veckans recap: 1 pass, 45 min')
  })
  it('faller tillbaka på datumintervall utan pass, och behåller prefix', () => {
    expect(weeklyDigestSubject(rec(0, 0), '[TEST] ')).toMatch(/^\[TEST\] Veckans recap: \d+ \w+/)
  })
})
