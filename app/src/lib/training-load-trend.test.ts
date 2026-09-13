import { describe, it, expect } from 'vitest'
import { computeTrainingKcalTrend } from './training-load-trend'
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

// 20 activities with real calories spread over the last 28 days — well
// past MIN_TRAINING_HISTORY_DAYS (14) — each 200 kcal.
function denseRecentActivities(): (ActivityRow & { calories: number | null })[] {
  return Array.from({ length: 20 }, (_, i) => act(`recent-${i}`, i, 200))
}

describe('computeTrainingKcalTrend', () => {
  it('computes the corrected 28-day rolling average for the latest week when there is enough real data', () => {
    const points = computeTrainingKcalTrend(denseRecentActivities(), 0.75, NOW, 1)
    expect(points).toHaveLength(1)
    // 20 activities × 200 kcal = 4000 kcal over 28 days = 142.86/day → 107 corrected.
    expect(points[0].correctedTrainingKcalPerDay).toBe(Math.round((4000 / 28) * 0.75))
  })

  it('returns null for a week whose 28-day window has fewer than 14 days of real calorie data', () => {
    // Only 5 days with real calories in the window — below the threshold.
    const sparse = Array.from({ length: 5 }, (_, i) => act(`sparse-${i}`, i, 200))
    const points = computeTrainingKcalTrend(sparse, 0.75, NOW, 1)
    expect(points[0].correctedTrainingKcalPerDay).toBeNull()
  })

  it('ignores activities without a real calories value when counting "real" days', () => {
    // 20 activities but all calories null — daysWithRealTrainingCalories
    // must not count these as real, however many there are.
    const noCalories = Array.from({ length: 20 }, (_, i) => act(`nocal-${i}`, i, null))
    const points = computeTrainingKcalTrend(noCalories, 0.75, NOW, 1)
    expect(points[0].correctedTrainingKcalPerDay).toBeNull()
  })

  it('produces one point per week, oldest first, each with its own correct 28-day window', () => {
    // Dense real data only in the most recent 28 days — the older weeks
    // (whose window falls entirely outside that range) must come back
    // null, proving each point uses its OWN window, not one shared range.
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
    // Computed independently from the raw average, not derived from the
    // other call's already-rounded output — chaining two Math.round()
    // calls can drift by 1 from rounding the intermediate value.
    const rawAvgPerDay = 4000 / 28
    const uncorrected = computeTrainingKcalTrend(denseRecentActivities(), 1, NOW, 1)[0].correctedTrainingKcalPerDay
    const corrected = computeTrainingKcalTrend(denseRecentActivities(), 0.5, NOW, 1)[0].correctedTrainingKcalPerDay
    expect(uncorrected).toBe(Math.round(rawAvgPerDay))
    expect(corrected).toBe(Math.round(rawAvgPerDay * 0.5))
  })
})
