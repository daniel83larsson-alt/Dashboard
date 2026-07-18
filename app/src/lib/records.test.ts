import { describe, it, expect } from 'vitest'
import { computeSportPRs, computeAllSportPRs, longestSession, newRecordsForLatest, type Activity } from './records'

function act(overrides: Partial<Activity> & { id: string }): Activity {
  return {
    start_date: '2026-07-01T08:00:00Z',
    distance: 5000,
    moving_time: 1200,
    sport_type: 'Rowing',
    ...overrides,
  }
}

describe('computeSportPRs', () => {
  it('picks the farthest distance covered within a time window', () => {
    const acts = [
      act({ id: 'a', moving_time: 1650, distance: 8000 }), // in the 30-min window (1620-1980s)
      act({ id: 'b', moving_time: 1700, distance: 7500 }),
    ]
    const result = computeSportPRs(acts, 'Rowing')
    const thirtyMin = result.prs.find(p => p.label === 'Bäst 30 min')
    expect(thirtyMin?.pr.activityId).toBe('a')
  })

  it('picks the fastest time for a benchmark distance within its ±4% band', () => {
    const acts = [
      act({ id: 'slow', distance: 5100, moving_time: 1300 }),
      act({ id: 'fast', distance: 4950, moving_time: 1100 }),
    ]
    const result = computeSportPRs(acts, 'Rowing')
    const fiveK = result.prs.find(p => p.label === 'Snabbaste 5 km')
    expect(fiveK?.pr.activityId).toBe('fast')
  })

  it('excludes activities outside a benchmark\'s ±4% band', () => {
    const acts = [act({ id: 'a', distance: 4700, moving_time: 1000 })] // 6% short of 5km
    const result = computeSportPRs(acts, 'Rowing')
    expect(result.prs.find(p => p.label === 'Snabbaste 5 km')).toBeUndefined()
  })

  it('gives cycling an extra 20km benchmark that rowing does not get', () => {
    const rideResult = computeSportPRs([act({ id: 'a', sport_type: 'Ride', distance: 20000, moving_time: 2400 })], 'Ride')
    const rowResult = computeSportPRs([act({ id: 'b', distance: 20000, moving_time: 2400 })], 'Rowing')
    expect(rideResult.prs.some(p => p.label === 'Snabbaste 20 km')).toBe(true)
    expect(rowResult.prs.some(p => p.label === 'Snabbaste 20 km')).toBe(false)
  })
})

describe('computeAllSportPRs', () => {
  it('excludes sports that are not PR-eligible (e.g. strength training)', () => {
    const acts = [
      act({ id: 'a', sport_type: 'WeightTraining', distance: 0, moving_time: 1800 }),
      act({ id: 'b', sport_type: 'Rowing', distance: 5000, moving_time: 1200 }),
    ]
    const result = computeAllSportPRs(acts)
    expect(result.map(s => s.sport)).toEqual(['Rowing'])
  })

  it('sorts sports by total distance, most first', () => {
    const acts = [
      act({ id: 'a', sport_type: 'Run', distance: 3000, moving_time: 900 }),
      act({ id: 'b', sport_type: 'Rowing', distance: 10000, moving_time: 2400 }),
    ]
    const result = computeAllSportPRs(acts)
    expect(result.map(s => s.sport)).toEqual(['Rowing', 'Run'])
  })
})

describe('longestSession', () => {
  it('returns the activity with the greatest moving_time', () => {
    const acts = [act({ id: 'short', moving_time: 600 }), act({ id: 'long', moving_time: 3600 })]
    expect(longestSession(acts)?.id).toBe('long')
  })

  it('ignores sub-60s sync fragments', () => {
    const acts = [act({ id: 'frag', moving_time: 5 })]
    expect(longestSession(acts)).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(longestSession([])).toBeNull()
  })
})

describe('newRecordsForLatest', () => {
  it('does not credit a first-ever effort as "breaking" a record', () => {
    // Daniel's own framing: a first-ever 5km isn't a broken record, since
    // there's nothing prior in that category to have broken.
    const latest = act({ id: 'first', distance: 5000, moving_time: 1200 })
    expect(newRecordsForLatest(latest, [])).toEqual([])
  })

  it('credits a genuinely faster benchmark time as a new PR', () => {
    const prior = act({ id: 'old', distance: 5000, moving_time: 1300 })
    const latest = act({ id: 'new', distance: 5000, moving_time: 1100 })
    expect(newRecordsForLatest(latest, [prior])).toContain('Snabbaste 5 km')
  })

  it('does not credit a slower effort even at the same distance', () => {
    const prior = act({ id: 'old', distance: 5000, moving_time: 1100 })
    const latest = act({ id: 'new', distance: 5000, moving_time: 1300 })
    expect(newRecordsForLatest(latest, [prior])).not.toContain('Snabbaste 5 km')
  })

  it('credits the longest-session record independently of sport-specific PRs', () => {
    const prior = act({ id: 'old', sport_type: 'WeightTraining', distance: 0, moving_time: 1800 })
    const latest = act({ id: 'new', sport_type: 'WeightTraining', distance: 0, moving_time: 3600 })
    expect(newRecordsForLatest(latest, [prior])).toContain('Längsta passet någonsin')
  })

  it('only compares distance/pace PRs against prior activities of the same sport', () => {
    // Same moving_time on both sides so the (deliberately sport-agnostic)
    // "longest session ever" check stays neutral — isolates just the
    // sport-specific benchmark comparison this test is actually about.
    const priorRun = act({ id: 'run', sport_type: 'Run', distance: 5000, moving_time: 1200 })
    const latest = act({ id: 'row', sport_type: 'Rowing', distance: 5000, moving_time: 1200 })
    // Nothing prior in Rowing at this distance, so no PR credited despite
    // the Run activity covering the same ground.
    expect(newRecordsForLatest(latest, [priorRun])).toEqual([])
  })
})
