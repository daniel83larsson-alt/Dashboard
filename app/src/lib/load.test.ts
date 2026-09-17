import { describe, it, expect } from 'vitest'
import { activityLoad, weeklyLoad, weeklyMinutes, rollingBaselineMinutes } from './load'

function act(daysAgoFrom: Date, daysAgo: number, movingTimeSec: number, avgHr: number | null = null) {
  const d = new Date(daysAgoFrom)
  d.setDate(d.getDate() - daysAgo)
  return { start_date: d.toISOString(), moving_time: movingTimeSec, average_heartrate: avgHr }
}

describe('activityLoad', () => {
  it('scales by heart-rate reserve when HR data is present', () => {
    // 60 min at 50% HRR should score half of 60 min at 100% HRR.
    const half = activityLoad({ moving_time: 3600, average_heartrate: 135 }, 60, 210)
    const full = activityLoad({ moving_time: 3600, average_heartrate: 210 }, 60, 210)
    expect(half).toBeCloseTo(full / 2, 5)
  })

  it('falls back to a flat 0.5 intensity when there is no HR data, rather than excluding the pass', () => {
    expect(activityLoad({ moving_time: 3600, average_heartrate: null }, 60, 210)).toBe(30)
  })
})

describe('weeklyMinutes', () => {
  const now = new Date('2026-09-14T12:00:00Z')

  it('sums moving_time (in minutes) for activities inside the week only', () => {
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 6)
    const activities = [
      act(now, 2, 1800), // inside the week — 30 min
      act(now, 1, 1800), // inside the week — 30 min
      act(now, 10, 3600), // well before the week — excluded
    ]
    expect(weeklyMinutes(activities, weekStart, now)).toBe(60)
  })

  it('returns 0 for a week with no activities, not null or NaN', () => {
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 6)
    expect(weeklyMinutes([], weekStart, now)).toBe(0)
  })
})

describe('rollingBaselineMinutes', () => {
  const now = new Date('2026-09-14T12:00:00Z')

  it('averages minutes across the last N fully-completed weeks, excluding the current in-progress one', () => {
    // Two full prior weeks (8 and 15 days back), same duration each — the
    // baseline should equal that shared per-week total exactly.
    const activities = [act(now, 8, 3600), act(now, 15, 3600)]
    expect(rollingBaselineMinutes(activities, now, 8)).toBe(60)
  })

  it('returns null when there is no activity in any of the lookback weeks', () => {
    expect(rollingBaselineMinutes([], now, 8)).toBeNull()
  })
})

describe('weeklyLoad (existing behavior, not previously covered by a test)', () => {
  it('is 0 for an empty activity list', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 6)
    expect(weeklyLoad([], 60, 210, weekStart, now)).toBe(0)
  })
})
