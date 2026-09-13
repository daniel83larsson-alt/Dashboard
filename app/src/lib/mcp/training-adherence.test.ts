import { describe, it, expect } from 'vitest'
import { computeTrainingAdherence } from './training-adherence'
import type { McpActivity } from './fetch-training-data'

function act(startDate: string, sportType: string): McpActivity {
  return { id: startDate + sportType, strava_id: 1, start_date: `${startDate}T10:00:00Z`, distance: 5000, moving_time: 1800, sport_type: sportType }
}

const TODAY = '2026-09-13'

describe('computeTrainingAdherence', () => {
  it('counts strength and rowing sessions within the window, ignoring older ones', () => {
    const activities = [
      act('2026-08-01', 'Kettlebell'), // 6 weeks back, outside a 4-week window
      act('2026-09-01', 'WeightTraining'), // within 4 weeks
      act('2026-09-05', 'Kettlebell'),
      act('2026-09-08', 'Rowing'),
      act('2026-09-10', 'Rowing'),
      act('2026-09-11', 'Run'),
    ]
    const result = computeTrainingAdherence(activities, null, 4, TODAY)
    expect(result.strength_sessions_logged).toBe(2)
    expect(result.rowing_sessions_logged).toBe(2)
    expect(result.period_weeks).toBe(4)
  })

  it('returns null target when no matching active structured goal exists', () => {
    const result = computeTrainingAdherence([], null, 4, TODAY)
    expect(result.strength_sessions_target_per_week).toBeNull()
  })

  it('passes through a structured strength goal target', () => {
    const result = computeTrainingAdherence([], { sportType: 'Kettlebell', sessionsPerWeek: 1.5 }, 4, TODAY)
    expect(result.strength_sessions_target_per_week).toBe(1.5)
  })

  it('finds the last strength session even outside the adherence window and computes days since', () => {
    const activities = [act('2026-08-01', 'Kettlebell'), act('2026-09-05', 'Rowing')]
    const result = computeTrainingAdherence(activities, null, 2, TODAY)
    expect(result.last_strength_session).toBe('2026-08-01')
    expect(result.days_since_last_strength_session).toBe(43)
  })

  it('returns null for last-session fields when no strength session exists at all', () => {
    const result = computeTrainingAdherence([act('2026-09-05', 'Rowing')], null, 4, TODAY)
    expect(result.last_strength_session).toBeNull()
    expect(result.days_since_last_strength_session).toBeNull()
  })
})
