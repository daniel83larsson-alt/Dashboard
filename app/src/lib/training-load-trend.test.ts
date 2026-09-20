import { describe, it, expect } from 'vitest'
import { computeTrainingKcalTrend, CHART_WINDOW_DAYS } from './training-load-trend'
import { MIN_TRAINING_HISTORY_DAYS } from './deficit-budget-refreeze'
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

// One activity per day for the full CHART_WINDOW_DAYS window (today back
// through CHART_WINDOW_DAYS-1 days ago), each 200 kcal — dynamically sized
// so this test file doesn't need updating the next time the window itself
// is retuned (already happened twice: 28→7→14).
function denseRecentActivities(): (ActivityRow & { calories: number | null })[] {
  return Array.from({ length: CHART_WINDOW_DAYS }, (_, i) => act(`recent-${i}`, i, 200))
}

describe('computeTrainingKcalTrend', () => {
  it('computes the corrected rolling average for the latest week when there is enough real data', () => {
    const points = computeTrainingKcalTrend(denseRecentActivities(), 0.75, NOW, 1)
    expect(points).toHaveLength(1)
    // CHART_WINDOW_DAYS activities × 200 kcal = 200/day average → corrected by 0.75.
    const totalKcal = CHART_WINDOW_DAYS * 200
    expect(points[0].correctedTrainingKcalPerDay).toBe(Math.round((totalKcal / CHART_WINDOW_DAYS) * 0.75))
  })

  it(`returns null for a week whose window has fewer than ${MIN_TRAINING_HISTORY_DAYS} days of real calorie data`, () => {
    const sparse = Array.from({ length: MIN_TRAINING_HISTORY_DAYS - 1 }, (_, i) => act(`sparse-${i}`, i, 200))
    const points = computeTrainingKcalTrend(sparse, 0.75, NOW, 1)
    expect(points[0].correctedTrainingKcalPerDay).toBeNull()
  })

  it('ignores activities without a real calories value when counting "real" days', () => {
    const noCalories = Array.from({ length: CHART_WINDOW_DAYS }, (_, i) => act(`nocal-${i}`, i, null))
    const points = computeTrainingKcalTrend(noCalories, 0.75, NOW, 1)
    expect(points[0].correctedTrainingKcalPerDay).toBeNull()
  })

  it('produces one point per week, oldest first, each with its own correct window', () => {
    // Dense real data only in the most recent CHART_WINDOW_DAYS — points
    // whose window falls entirely outside that range must come back null,
    // proving each point uses its OWN window, not one shared range. With a
    // 14-day window sampled every 7 days, adjacent windows legitimately
    // overlap by 7 days — so the two most recent points both see enough
    // real data once the window reaches CHART_WINDOW_DAYS=14 (not just the
    // very latest one, unlike the old 7-day window where each point's
    // window was fully disjoint from its neighbors).
    const points = computeTrainingKcalTrend(denseRecentActivities(), 0.75, NOW, 4)
    expect(points).toHaveLength(4)
    expect(points.map(p => p.weekEndDateKey)).toEqual([
      '2026-08-23', '2026-08-30', '2026-09-06', '2026-09-13',
    ])
    expect(points[0].correctedTrainingKcalPerDay).toBeNull()
    expect(points[1].correctedTrainingKcalPerDay).toBeNull()
    expect(points[2].correctedTrainingKcalPerDay).not.toBeNull()
    expect(points[3].correctedTrainingKcalPerDay).not.toBeNull()
  })

  it('applies the garmin correction factor multiplicatively', () => {
    const rawAvgPerDay = (CHART_WINDOW_DAYS * 200) / CHART_WINDOW_DAYS
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
