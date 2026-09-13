import { describe, it, expect } from 'vitest'
import { computeRowingTrends } from './rowing-trends'
import type { McpActivity } from './fetch-training-data'
import type { DayWellness } from '@/lib/garmin-sync'

const TODAY = '2026-09-13'

function act(startDate: string, distance: number, movingTime: number, sportType = 'Rowing'): McpActivity {
  return { id: startDate, strava_id: 1, start_date: `${startDate}T10:00:00Z`, distance, moving_time: movingTime, sport_type: sportType }
}

function wellnessDay(date: string, restingHR: number): DayWellness {
  return { date, restingHR, sleepHours: null, deepSleepHours: null, remSleepHours: null, lightSleepHours: null, steps: null, bodyBattery: null, hrv: null, hrvStatus: null, totalCalories: null, activeCalories: null }
}

describe('computeRowingTrends', () => {
  it('buckets weekly volume oldest-to-newest and computes whole-session average pace', () => {
    const activities = [
      act('2026-08-31', 5000, 1500), // week 1 (older), 2:30/500m
      act('2026-09-07', 5000, 1400), // week 2 (most recent), 2:20/500m
    ]
    const result = computeRowingTrends(activities, [], 2, TODAY)
    expect(result.weekly_volume_km).toEqual([5, 5])
    // combined 10000m / 2900s -> 145s/500m -> 2:25
    expect(result.avg_split_per_500m).toBe('2:25')
  })

  it('compares current period pace against the immediately preceding period of equal length', () => {
    const activities = [
      act('2026-08-20', 5000, 1600), // previous period: 2:40/500m
      act('2026-08-31', 5000, 1500),
      act('2026-09-07', 5000, 1400),
    ]
    const result = computeRowingTrends(activities, [], 2, TODAY)
    expect(result.trend_vs_previous_period).toBe('-15 sek/500m')
  })

  it('ignores non-rowing activities entirely', () => {
    const activities = [act('2026-09-10', 5000, 1500, 'Run')]
    const result = computeRowingTrends(activities, [], 2, TODAY)
    expect(result.avg_split_per_500m).toBeNull()
    expect(result.weekly_volume_km).toEqual([0, 0])
  })

  it('averages resting HR from wellness history within the period', () => {
    const wellness = [wellnessDay('2026-09-01', 55), wellnessDay('2026-09-10', 57), wellnessDay('2026-07-01', 90)]
    const result = computeRowingTrends([], wellness, 2, TODAY)
    expect(result.resting_hr_avg).toBe(56)
  })

  it('returns null pace fields when there is no rowing data at all', () => {
    const result = computeRowingTrends([], [], 4, TODAY)
    expect(result.avg_split_per_500m).toBeNull()
    expect(result.trend_vs_previous_period).toBeNull()
    expect(result.resting_hr_avg).toBeNull()
  })
})
