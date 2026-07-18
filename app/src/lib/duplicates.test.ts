import { describe, it, expect } from 'vitest'
import { isFuzzyMatch, findDuplicateGroups, suggestKeepId, isMergeCandidate, splitMergedPairs, dedupeForStats, type ActivityRow } from './duplicates'

// Concept2 rows use a negative strava_id (source marker), Garmin rows a
// positive one — same convention the real sync code uses.
function row(overrides: Partial<ActivityRow> & { id: string }): ActivityRow {
  return {
    strava_id: 1,
    start_date: '2026-07-13T08:00:00Z',
    distance: 5000,
    moving_time: 1200,
    sport_type: 'Rowing',
    ...overrides,
  }
}

describe('isMergeCandidate', () => {
  it('rejects two rows from the same source', () => {
    const a = row({ id: 'a', strava_id: 100 })
    const b = row({ id: 'b', strava_id: 200 })
    expect(isMergeCandidate(a, b)).toBe(false)
  })

  it('rejects different days', () => {
    const a = row({ id: 'a', strava_id: -1 })
    const b = row({ id: 'b', strava_id: 100, start_date: '2026-07-14T08:00:00Z' })
    expect(isMergeCandidate(a, b)).toBe(false)
  })

  it('accepts a real interval-workout swing (~25% distance/time drift) that isFuzzyMatch would reject', () => {
    // The actual bug this tolerance was built for: Concept2 excludes rest
    // time from its total, Garmin's moving_time includes some of it.
    const concept2 = row({ id: 'c', strava_id: -1, distance: 4000, moving_time: 1200 })
    const garmin = row({ id: 'g', strava_id: 500, distance: 5000, moving_time: 1500 })
    expect(isMergeCandidate(concept2, garmin)).toBe(true)
    expect(isFuzzyMatch(concept2, garmin)).toBe(false)
  })

  it('rejects a swing beyond the loose tolerance', () => {
    const concept2 = row({ id: 'c', strava_id: -1, distance: 2000, moving_time: 600 })
    const garmin = row({ id: 'g', strava_id: 500, distance: 5000, moving_time: 1200 })
    expect(isMergeCandidate(concept2, garmin)).toBe(false)
  })

  it('allows very short passes through on the absolute-seconds floor', () => {
    const concept2 = row({ id: 'c', strava_id: -1, distance: 100, moving_time: 65 })
    const garmin = row({ id: 'g', strava_id: 500, distance: 100, moving_time: 72 })
    expect(isMergeCandidate(concept2, garmin)).toBe(true)
  })
})

describe('splitMergedPairs', () => {
  it('pairs a Concept2 row with its Garmin counterpart', () => {
    const c = row({ id: 'c', strava_id: -1 })
    const g = row({ id: 'g', strava_id: 500 })
    const { singles, pairs } = splitMergedPairs([c, g])
    expect(singles).toHaveLength(0)
    expect(pairs).toEqual([{ primary: c, partner: g }])
  })

  it('leaves an unmatched row as a single', () => {
    const c = row({ id: 'c', strava_id: -1 })
    const { singles, pairs } = splitMergedPairs([c])
    expect(singles).toEqual([c])
    expect(pairs).toHaveLength(0)
  })

  it('pairs two same-day sessions by closest distance instead of arbitrarily', () => {
    // A short test pull and a real workout both logged twice the same day —
    // moving_time alone can't disambiguate (see the file's own comment on
    // why distance is used), so this locks in that distance is what decides.
    const c1 = row({ id: 'c1', strava_id: -1, distance: 500, moving_time: 120 })
    const c2 = row({ id: 'c2', strava_id: -2, distance: 5000, moving_time: 1200 })
    const g1 = row({ id: 'g1', strava_id: 500, distance: 520, moving_time: 130 })
    const g2 = row({ id: 'g2', strava_id: 600, distance: 4900, moving_time: 1180 })
    const { pairs } = splitMergedPairs([c1, c2, g1, g2])
    expect(pairs).toHaveLength(2)
    const byPrimary = new Map(pairs.map(p => [p.primary.id, p.partner.id]))
    expect(byPrimary.get('c1')).toBe('g1')
    expect(byPrimary.get('c2')).toBe('g2')
  })

  it('never merges rows from different sports even on the same day', () => {
    const c = row({ id: 'c', strava_id: -1, sport_type: 'Rowing' })
    const g = row({ id: 'g', strava_id: 500, sport_type: 'Run' })
    const { singles, pairs } = splitMergedPairs([c, g])
    expect(pairs).toHaveLength(0)
    expect(singles).toHaveLength(2)
  })
})

describe('dedupeForStats', () => {
  it('counts a merged Concept2+Garmin pair once, keeping the Concept2 (primary) row', () => {
    const c = row({ id: 'c', strava_id: -1, distance: 5000 })
    const g = row({ id: 'g', strava_id: 500, distance: 5100 })
    const result = dedupeForStats([c, g])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c')
  })

  it('copies the Garmin partner\'s hrZones onto the surviving Concept2 row', () => {
    // The actual regression this session fixed: "Veckans pulszoner" silently
    // lost zone data for every merged pair because only the surviving row's
    // own raw_data was ever read afterward.
    const c = row({ id: 'c', strava_id: -1, raw_data: {} })
    const g = row({ id: 'g', strava_id: 500, raw_data: { hrZones: { z1: 100, z2: 200 } } })
    const result = dedupeForStats([c, g])
    expect(result).toHaveLength(1)
    expect((result[0].raw_data as { hrZones?: unknown }).hrZones).toEqual({ z1: 100, z2: 200 })
  })

  it('does not overwrite hrZones the primary row already has', () => {
    const c = row({ id: 'c', strava_id: -1, raw_data: { hrZones: { z1: 999 } } })
    const g = row({ id: 'g', strava_id: 500, raw_data: { hrZones: { z1: 1 } } })
    const result = dedupeForStats([c, g])
    expect((result[0].raw_data as { hrZones?: unknown }).hrZones).toEqual({ z1: 999 })
  })

  it('filters out sub-60s sync fragments from stats but a real short pass survives', () => {
    const fragment = row({ id: 'frag', strava_id: 500, moving_time: 8 })
    const real = row({ id: 'real', strava_id: 501, moving_time: 61, start_date: '2026-07-14T08:00:00Z' })
    const result = dedupeForStats([fragment, real])
    expect(result.map(a => a.id)).toEqual(['real'])
  })

  it('preserves input ordering (callers rely on index 0 being the latest pass)', () => {
    const newest = row({ id: 'a', strava_id: 500, start_date: '2026-07-15T08:00:00Z' })
    const oldest = row({ id: 'b', strava_id: 501, start_date: '2026-07-01T08:00:00Z' })
    const result = dedupeForStats([newest, oldest])
    expect(result.map(a => a.id)).toEqual(['a', 'b'])
  })
})

describe('isFuzzyMatch / findDuplicateGroups (same-source duplicate cleanup)', () => {
  it('uses a tighter 5% tolerance than merge-candidate matching', () => {
    const a = row({ id: 'a', strava_id: 100, distance: 5000, moving_time: 1200 })
    const b = row({ id: 'b', strava_id: 200, distance: 5300, moving_time: 1250 })
    // ~6% distance drift — would pass isMergeCandidate's 30% but not isFuzzyMatch's 5%
    expect(isFuzzyMatch(a, b)).toBe(false)
  })

  it('groups near-identical same-source rows as duplicates', () => {
    const a = row({ id: 'a', strava_id: 100, distance: 5000, moving_time: 1200 })
    const b = row({ id: 'b', strava_id: 200, distance: 5010, moving_time: 1205 })
    const groups = findDuplicateGroups([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0].map(x => x.id).sort()).toEqual(['a', 'b'])
  })
})

describe('suggestKeepId', () => {
  it('prefers the row with heart-rate data', () => {
    const withoutHr = row({ id: 'a', created_at: '2026-07-01T00:00:00Z', average_heartrate: null })
    const withHr = row({ id: 'b', created_at: '2026-06-01T00:00:00Z', average_heartrate: 140 })
    expect(suggestKeepId([withoutHr, withHr])).toBe('b')
  })

  it('falls back to the most recently created row when neither has heart-rate', () => {
    const older = row({ id: 'a', created_at: '2026-06-01T00:00:00Z', average_heartrate: null })
    const newer = row({ id: 'b', created_at: '2026-07-01T00:00:00Z', average_heartrate: null })
    expect(suggestKeepId([older, newer])).toBe('b')
  })
})
