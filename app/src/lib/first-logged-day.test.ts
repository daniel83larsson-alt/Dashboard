import { describe, it, expect } from 'vitest'
import { earliestLoggedKey } from './first-logged-day'
import type { YazioDay } from './yazio-history'

const yd = (date: string, kcalEaten: number | null) => ({ date, kcalEaten }) as YazioDay

describe('earliestLoggedKey', () => {
  it('is null when nothing was ever logged', () => {
    expect(earliestLoggedKey(null, [])).toBeNull()
    expect(earliestLoggedKey(null, [yd('2026-09-01', null)])).toBeNull()
  })
  it('uses the first manual log when there is no YAZIO data', () => {
    expect(earliestLoggedKey('2026-09-10T07:30:00Z', [])).toBe('2026-09-10')
  })
  it('takes the earlier of manual and YAZIO, ignoring YAZIO days without kcal', () => {
    expect(earliestLoggedKey('2026-09-10T07:30:00Z', [yd('2026-08-01', null), yd('2026-09-02', 1800)])).toBe('2026-09-02')
    expect(earliestLoggedKey('2026-08-20T07:30:00Z', [yd('2026-09-02', 1800)])).toBe('2026-08-20')
  })
})
