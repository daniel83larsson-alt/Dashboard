import { describe, it, expect } from 'vitest'
import { buildTrainingLogText } from './training-log-text'
import type { ActivityRow } from './duplicates'

function row(overrides: Partial<ActivityRow> & { id: string }): ActivityRow {
  return {
    strava_id: 1,
    start_date: '2026-07-13T08:00:00Z',
    distance: 5000,
    moving_time: 1200,
    sport_type: 'Run',
    ...overrides,
  }
}

describe('buildTrainingLogText', () => {
  const now = new Date('2026-07-20T12:00:00Z') // a Monday

  it('reports no sessions when nothing falls in range', () => {
    const text = buildTrainingLogText([], 4, now)
    expect(text).toMatch(/Inga loggade pass/)
  })

  it('includes a session inside the requested window and excludes one before it', () => {
    const inRange = row({ id: 'a', start_date: '2026-07-15T08:00:00Z' })
    const tooOld = row({ id: 'b', start_date: '2025-01-01T08:00:00Z' })
    const text = buildTrainingLogText([inRange, tooOld], 2, now)
    expect(text).toContain('löpning')
    expect(text).not.toContain('2025')
  })

  it('groups sessions under the correct week header', () => {
    const a = row({ id: 'a', start_date: '2026-07-13T08:00:00Z', sport_type: 'Rowing' })
    const text = buildTrainingLogText([a], 2, now)
    expect(text).toContain('Vecka 13–19/7 2026')
    expect(text).toContain('rodd')
  })

  it('merges a real Concept2+Garmin pair into one line, not two', () => {
    const concept2 = row({ id: 'c', strava_id: -1, sport_type: 'Rowing', distance: 5000, moving_time: 1200 })
    const garmin = row({ id: 'g', strava_id: 500, sport_type: 'Rowing', distance: 5050, moving_time: 1210 })
    const text = buildTrainingLogText([concept2, garmin], 4, now)
    expect(text).toContain('1 pass totalt')
  })

  it('omits distance for a non-distance sport', () => {
    const strength = row({ id: 's', sport_type: 'WeightTraining', distance: 0, moving_time: 2400, start_date: '2026-07-15T08:00:00Z' })
    const text = buildTrainingLogText([strength], 2, now)
    const activityLine = text.split('\n').find(l => l.startsWith('- '))
    expect(activityLine).toContain('styrketräning')
    expect(activityLine).not.toMatch(/km/)
  })

  it('includes the pass name when present', () => {
    const kettlebell = row({ id: 'k', sport_type: 'Kettlebell', name: '3x10 Svingar', start_date: '2026-07-15T08:00:00Z' })
    const text = buildTrainingLogText([kettlebell], 2, now)
    expect(text).toContain('3x10 Svingar')
  })
})
