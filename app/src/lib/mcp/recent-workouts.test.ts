import { describe, it, expect } from 'vitest'
import { computeRecentWorkouts } from './recent-workouts'
import type { McpActivity } from './fetch-training-data'

function act(overrides: Partial<McpActivity> & { start_date: string; sport_type: string }): McpActivity {
  return { id: overrides.start_date + overrides.sport_type, strava_id: 1, distance: 0, moving_time: 0, average_heartrate: null, ...overrides }
}

describe('computeRecentWorkouts', () => {
  it('returns most-recent-first, capped at limit', () => {
    const activities = [
      act({ start_date: '2026-09-01T10:00:00Z', sport_type: 'Run' }),
      act({ start_date: '2026-09-05T10:00:00Z', sport_type: 'Run' }),
      act({ start_date: '2026-09-10T10:00:00Z', sport_type: 'Rowing' }),
    ]
    const result = computeRecentWorkouts(activities, 2, null)
    expect(result.workouts.map(w => w.date)).toEqual(['2026-09-10', '2026-09-05'])
  })

  it('computes rowing split per 500m only for rowing sessions', () => {
    const activities = [
      act({ start_date: '2026-09-10T10:00:00Z', sport_type: 'Rowing', distance: 5000, moving_time: 1650 }), // 165s/500m = 2:45
      act({ start_date: '2026-09-11T10:00:00Z', sport_type: 'Run', distance: 5000, moving_time: 1650 }),
    ]
    const result = computeRecentWorkouts(activities, 10, null)
    const rowing = result.workouts.find(w => w.type === 'rodd')!
    const run = result.workouts.find(w => w.type === 'löpning')!
    expect(rowing.avg_split_per_500m).toBe('2:45')
    expect(run.avg_split_per_500m).toBeNull()
  })

  it('filters by type, matching either the raw sport_type or its Swedish label', () => {
    const activities = [
      act({ start_date: '2026-09-10T10:00:00Z', sport_type: 'Rowing' }),
      act({ start_date: '2026-09-11T10:00:00Z', sport_type: 'Kettlebell' }),
    ]
    expect(computeRecentWorkouts(activities, 10, 'rodd').workouts).toHaveLength(1)
    expect(computeRecentWorkouts(activities, 10, 'Kettlebell').workouts).toHaveLength(1)
    expect(computeRecentWorkouts(activities, 10, 'cykling').workouts).toHaveLength(0)
  })

  it('carries the raw name field through as-is instead of a structured exercises list', () => {
    const activities = [act({ start_date: '2026-09-10T10:00:00Z', sport_type: 'Kettlebell', name: '3x10 Svingar, 3x10 Goblet Squat' })]
    const result = computeRecentWorkouts(activities, 10, null)
    expect(result.workouts[0].name).toBe('3x10 Svingar, 3x10 Goblet Squat')
  })
})
