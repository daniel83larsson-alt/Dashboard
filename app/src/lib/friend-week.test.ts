import { describe, it, expect } from 'vitest'
import { summarizeFriendWeek } from './friend-week'

function activity(overrides: Partial<Parameters<typeof summarizeFriendWeek>[0][number]> = {}) {
  return {
    id: crypto.randomUUID(),
    strava_id: Math.floor(Math.random() * 1e9),
    start_date: '2026-09-15T08:00:00Z',
    distance: 5000,
    moving_time: 1800,
    sport_type: 'Run',
    owner_id: 'friend-1',
    owner_name: 'Fredrik',
    source: 'garmin',
    ...overrides,
  }
}

describe('summarizeFriendWeek', () => {
  it('sums moving time and distance for a friend with multiple activities', () => {
    const activities = [
      activity({ moving_time: 1800, distance: 5000 }),
      activity({ moving_time: 3600, distance: 10000, strava_id: 2 }),
    ]
    const roster = [{ owner_id: 'friend-1', owner_name: 'Fredrik' }]
    const result = summarizeFriendWeek(activities, roster)
    expect(result).toEqual([
      { ownerId: 'friend-1', ownerName: 'Fredrik', totalMovingTimeSec: 5400, totalDistanceM: 15000, activityCount: 2 },
    ])
  })

  it('zero-fills a friend with no activities this week instead of omitting them', () => {
    const roster = [{ owner_id: 'friend-1', owner_name: 'Fredrik' }, { owner_id: 'friend-2', owner_name: 'Marie' }]
    const result = summarizeFriendWeek([activity({ owner_id: 'friend-1' })], roster)
    expect(result).toContainEqual({ ownerId: 'friend-2', ownerName: 'Marie', totalMovingTimeSec: 0, totalDistanceM: 0, activityCount: 0 })
  })

  it('sorts most active first', () => {
    const roster = [{ owner_id: 'a', owner_name: 'A' }, { owner_id: 'b', owner_name: 'B' }]
    const result = summarizeFriendWeek([
      activity({ owner_id: 'a', moving_time: 600 }),
      activity({ owner_id: 'b', moving_time: 3600, strava_id: 99 }),
    ], roster)
    expect(result.map(r => r.ownerId)).toEqual(['b', 'a'])
  })

  it('dedupes a Garmin+Concept2-merged pair instead of double-counting the same session', () => {
    // Same real session, synced from both sources close together in time —
    // exactly the pattern dedupeForStats groups as one, see lib/duplicates.ts.
    const roster = [{ owner_id: 'friend-1', owner_name: 'Fredrik' }]
    const activities = [
      activity({ strava_id: 500, source: 'garmin', moving_time: 1800, distance: 5000, start_date: '2026-09-15T08:00:00Z', sport_type: 'Rowing' }),
      activity({ strava_id: -500, source: 'concept2', moving_time: 1810, distance: 5010, start_date: '2026-09-15T08:00:05Z', sport_type: 'Rowing' }),
    ]
    const result = summarizeFriendWeek(activities, roster)
    expect(result[0].activityCount).toBe(1)
  })

  it('returns an empty list for an empty roster', () => {
    expect(summarizeFriendWeek([activity()], [])).toEqual([])
  })
})
