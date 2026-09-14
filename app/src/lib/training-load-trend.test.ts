import { describe, it, expect } from 'vitest'
import { computeTrainingKcalTrend, CHART_WINDOW_DAYS } from './training-load-trend'
import type { ActivityRow } from './duplicates'

const NOW = new Date('2026-09-13T12:00:00Z')

function act(id: string, daysAgo: number, calories: number | null): ActivityRow & { calories: number | null } {
  const d = new Date(NOW)
  d.setDate(d.getDate() - daysAgo)
  return {
    id, strava_id: Number(id), start_date: d.toISOString(), distance: 0, moving_time: 1800,
    sport_type: 'Run', calories,
  }
}

function dateKeyDaysAgo(daysAgo: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

// One activity per day for the last 7 days (today back through 6 days
// ago) — a full CHART_WINDOW_DAYS of real data, each 200 kcal.
function denseRecentActivities(): (ActivityRow & { calories: number | null })[] {
  return Array.from({ length: CHART_WINDOW_DAYS }, (_, i) => act(`recent-${i}`, i, 200))
}

describe('computeTrainingKcalTrend', () => {
  it('computes the corrected 7-day rolling average for the latest week when there is enough real data', () => {
    const points = computeTrainingKcalTrend(denseRecentActivities(), 0.75, NOW, 1)
    expect(points).toHaveLength(1)
    // 7 activities × 200 kcal = 1400 kcal over 7 days = 200/day → 150 corrected.
    expect(points[0].correctedTrainingKcalPerDay).toBe(Math.round((1400 / 7) * 0.75))
  })

  it('returns null for a week whose 7-day window has fewer than 3 days of real calorie data', () => {
    const sparse = [act('a', 0, 200), act('b', 1, 200)]
    const points = computeTrainingKcalTrend(sparse, 0.75, NOW, 1)
    expect(points[0].correctedTrainingKcalPerDay).toBeNull()
  })

  it('ignores activities without a real calories value when counting "real" days', () => {
    const noCalories = Array.from({ length: CHART_WINDOW_DAYS }, (_, i) => act(`nocal-${i}`, i, null))
    const points = computeTrainingKcalTrend(noCalories, 0.75, NOW, 1)
    expect(points[0].correctedTrainingKcalPerDay).toBeNull()
  })

  it('produces one point per week, oldest first, each with its own correct 7-day window', () => {
    // Dense real data only in the most recent 7 days — older weeks (whose
    // window falls entirely outside that range) must come back null,
    // proving each point uses its OWN window, not one shared range.
    const points = computeTrainingKcalTrend(denseRecentActivities(), 0.75, NOW, 3)
    expect(points).toHaveLength(3)
    expect(points.map(p => p.weekEndDateKey)).toEqual([
      '2026-08-30', '2026-09-06', '2026-09-13',
    ])
    expect(points[0].correctedTrainingKcalPerDay).toBeNull()
    expect(points[1].correctedTrainingKcalPerDay).toBeNull()
    expect(points[2].correctedTrainingKcalPerDay).not.toBeNull()
  })

  it('applies the garmin correction factor multiplicatively', () => {
    const rawAvgPerDay = 1400 / 7
    const uncorrected = computeTrainingKcalTrend(denseRecentActivities(), 1, NOW, 1)[0].correctedTrainingKcalPerDay
    const corrected = computeTrainingKcalTrend(denseRecentActivities(), 0.5, NOW, 1)[0].correctedTrainingKcalPerDay
    expect(uncorrected).toBe(Math.round(rawAvgPerDay))
    expect(corrected).toBe(Math.round(rawAvgPerDay * 0.5))
  })

  it('counts non-normal day tags logged within that week\'s window', () => {
    const dayTags = [
      { date: dateKeyDaysAgo(0), tag: 'sick' },
      { date: dateKeyDaysAgo(1), tag: 'sick' },
      { date: dateKeyDaysAgo(2), tag: 'normal' }, // excluded — not a reason for a dip
    ]
    const points = computeTrainingKcalTrend(denseRecentActivities(), 0.75, NOW, 1, dayTags)
    expect(points[0].contextTagCounts).toEqual({ sick: 2 })
  })

  it('does not count a tagged day that falls outside the week\'s window', () => {
    const dayTags = [{ date: dateKeyDaysAgo(20), tag: 'travel' }]
    const points = computeTrainingKcalTrend(denseRecentActivities(), 0.75, NOW, 1, dayTags)
    expect(points[0].contextTagCounts).toEqual({})
  })

  it('returns an empty contextTagCounts when no dayTags are passed at all', () => {
    const points = computeTrainingKcalTrend(denseRecentActivities(), 0.75, NOW, 1)
    expect(points[0].contextTagCounts).toEqual({})
  })
})
