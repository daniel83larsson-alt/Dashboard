import { describe, it, expect } from 'vitest'
import { computeTdeeTrend } from './tdee-trend'
import type { BudgetEvent } from '@/lib/deficit'

const TODAY_KEY = '2026-09-20'

describe('computeTdeeTrend', () => {
  it('produces one point per week, oldest first, ending today', () => {
    const trend = computeTdeeTrend(2622, [], TODAY_KEY, 3)
    expect(trend.period_weeks).toBe(3)
    expect(trend.points.map(p => p.week_end_date)).toEqual([
      '2026-09-06', '2026-09-13', '2026-09-20',
    ])
  })

  it('reconstructs the TDEE actually in force at each week\'s end, not just today\'s current value', () => {
    const events: BudgetEvent[] = [
      { createdAt: '2026-09-01T00:00:00Z', newBudgetKcal: 2049, newTdeeKcal: 2680 },
      { createdAt: '2026-09-15T00:00:00Z', newBudgetKcal: 2166, newTdeeKcal: 2622 },
    ]
    const trend = computeTdeeTrend(2622, events, TODAY_KEY, 3)
    // 2026-09-06 and 2026-09-13 both fall after the first event (09-01) but
    // before the second (09-15) -> 2680. 2026-09-20 falls after both -> 2622.
    expect(trend.points[0].tdee_kcal).toBe(2680)
    expect(trend.points[1].tdee_kcal).toBe(2680)
    expect(trend.points[2].tdee_kcal).toBe(2622)
  })

  it('reports null for every point when there is no TDEE at all yet', () => {
    const trend = computeTdeeTrend(null, [], TODAY_KEY, 2)
    expect(trend.points.every(p => p.tdee_kcal === null)).toBe(true)
  })
})
