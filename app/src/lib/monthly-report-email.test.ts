import { describe, it, expect } from 'vitest'
import { monthlyReportSubject } from './monthly-report-email'
import type { MonthlyReportRecord } from './monthly-report-generate'

const rec = (count: number, totalKm: number) => ({
  data: { monthLabel: 'september 2026', thisMonth: { sessions: { count, totalKm } } },
}) as unknown as MonthlyReportRecord

describe('monthlyReportSubject', () => {
  it('visar pass och distans', () => {
    expect(monthlyReportSubject(rec(18, 142))).toBe('Din månad (september 2026): 18 pass, 142 km')
  })
  it('utelämnar distans när den är 0', () => {
    expect(monthlyReportSubject(rec(6, 0))).toBe('Din månad (september 2026): 6 pass')
  })
  it('bara månaden utan pass, och behåller prefix', () => {
    expect(monthlyReportSubject(rec(0, 0), '[TEST] ')).toBe('[TEST] Din månad: september 2026')
  })
})
