import { describe, it, expect } from 'vitest'
import { computePaceAtEffort } from './pace-at-effort'
import type { McpActivity } from './fetch-training-data'

const TODAY = '2026-09-20'

function act(startDate: string, distance: number, movingTime: number, averageHeartrate: number | null, sportType = 'Rowing'): McpActivity {
  return { id: startDate + Math.random(), strava_id: 1, start_date: `${startDate}T10:00:00Z`, distance, moving_time: movingTime, sport_type: sportType, average_heartrate: averageHeartrate }
}

describe('computePaceAtEffort', () => {
  it('accepts either the internal sport_type or its Swedish label', () => {
    const activities = [act('2026-09-10', 5000, 1500, 120)]
    expect(computePaceAtEffort(activities, 'Rowing', 8, TODAY).hr_bands.length).toBe(1)
    expect(computePaceAtEffort(activities, 'rodd', 8, TODAY).hr_bands.length).toBe(1)
    expect(computePaceAtEffort(activities, 'ROTT', 8, TODAY).note).toMatch(/Okänd aktivitetstyp/)
  })

  it('groups sessions into 10bpm heart-rate bands and reports aggregated pace per band', () => {
    const activities = [
      act('2026-09-01', 5000, 1500, 118), // band 110-120, 2:30/500m
      act('2026-09-05', 5000, 1400, 122), // band 120-130, 2:20/500m
      act('2026-09-10', 5000, 1450, 121), // band 120-130, combines with above
    ]
    const result = computePaceAtEffort(activities, 'rodd', 8, TODAY)
    expect(result.hr_bands).toEqual([
      { hr_range: '110-120', performance_label: 'Snittempo', performance_value: '2:30/500m', sessions: 1 },
      { hr_range: '120-130', performance_label: 'Snittempo', performance_value: '2:23/500m', sessions: 2 },
    ])
  })

  it('computes a comparison period when compare_to_weeks_ago is set', () => {
    const activities = [
      act('2026-03-01', 5000, 1600, 120), // ~26 weeks ago, 2:40/500m
      act('2026-09-15', 5000, 1400, 120), // this period, 2:20/500m
    ]
    const result = computePaceAtEffort(activities, 'rodd', 8, TODAY, 26)
    expect(result.comparison_period_weeks_ago).toBe(26)
    expect(result.hr_bands[0].performance_value).toBe('2:20/500m')
    expect(result.comparison_hr_bands).toEqual([
      { hr_range: '120-130', performance_label: 'Snittempo', performance_value: '2:40/500m', sessions: 1 },
    ])
  })

  it('leaves comparison_hr_bands null when no comparison was requested', () => {
    const result = computePaceAtEffort([act('2026-09-10', 5000, 1500, 120)], 'rodd', 8, TODAY)
    expect(result.comparison_hr_bands).toBeNull()
  })

  it('ignores sessions with no recorded heart rate (null or a sensor-dropout 0, confirmed against real synced data)', () => {
    const activities = [act('2026-09-10', 5000, 1500, null), act('2026-09-11', 5000, 1500, 0)]
    const result = computePaceAtEffort(activities, 'rodd', 8, TODAY)
    expect(result.hr_bands).toEqual([])
    expect(result.note).toMatch(/Inga rodd-pass/)
  })

  it('reports strength/kettlebell activity types as unsupported rather than guessing', () => {
    const result = computePaceAtEffort([act('2026-09-10', 0, 1500, 120, 'Kettlebell')], 'kettlebell', 8, TODAY)
    expect(result.hr_bands).toEqual([])
    expect(result.note).toMatch(/mäts inte i tempo\/distans/)
  })

  it('only counts activities of the requested sport type', () => {
    const activities = [act('2026-09-10', 5000, 1500, 120, 'Run')]
    const result = computePaceAtEffort(activities, 'rodd', 8, TODAY)
    expect(result.hr_bands).toEqual([])
  })
})
