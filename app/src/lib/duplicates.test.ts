import { describe, it, expect } from 'vitest'
import { isFuzzyMatch, findDuplicateGroups, suggestKeepId, isMergeCandidate, splitMergedPairs, dedupeForStats, bestMergePartners, isCleanCrossSourceGroup, type ActivityRow } from './duplicates'

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

  it('merges a Concept2+Strava pair — Garmin auto-forwarding to Strava is a common real combination, not just Garmin+Concept2', () => {
    // Strava's own activity ids are large positive numbers, same shape as
    // Garmin's — without the explicit `source` field the old sign-only
    // check would have misjudged this, and an earlier version of this logic
    // deliberately refused to merge anything but a Garmin+Concept2 pair.
    // Daniel's own real account syncs Garmin+Concept2+Strava simultaneously
    // for the same session, so this must merge now.
    const concept2 = row({ id: 'c', strava_id: -1, source: 'concept2' })
    const strava = row({ id: 's', strava_id: 999999999, source: 'strava' })
    expect(isMergeCandidate(concept2, strava)).toBe(true)
  })

  it('merges a Garmin+Polar pair', () => {
    const garmin = row({ id: 'g', strava_id: 500, source: 'garmin' })
    const polar = row({ id: 'p', strava_id: -42, source: 'polar' })
    expect(isMergeCandidate(garmin, polar)).toBe(true)
  })

  it('still merges a real Garmin+Concept2 pair when source is explicitly set', () => {
    const concept2 = row({ id: 'c', strava_id: -1, source: 'concept2' })
    const garmin = row({ id: 'g', strava_id: 500, source: 'garmin' })
    expect(isMergeCandidate(concept2, garmin)).toBe(true)
  })

  it('never merges a manually-logged row, even against a close distance/time match', () => {
    const manual = row({ id: 'm', strava_id: -999, source: 'manual' })
    const garmin = row({ id: 'g', strava_id: 500, source: 'garmin' })
    expect(isMergeCandidate(manual, garmin)).toBe(false)
  })
})

describe('splitMergedPairs', () => {
  it('pairs a Concept2 row with its Garmin counterpart', () => {
    const c = row({ id: 'c', strava_id: -1, source: 'concept2' })
    const g = row({ id: 'g', strava_id: 500, source: 'garmin' })
    const { singles, groups } = splitMergedPairs([c, g])
    expect(singles).toHaveLength(0)
    expect(groups).toEqual([{ primary: c, partners: [g] }])
  })

  it('leaves an unmatched row as a single', () => {
    const c = row({ id: 'c', strava_id: -1 })
    const { singles, groups } = splitMergedPairs([c])
    expect(singles).toEqual([c])
    expect(groups).toHaveLength(0)
  })

  it('pairs two same-day sessions by closest distance instead of arbitrarily', () => {
    // A short test pull and a real workout both logged twice the same day —
    // moving_time alone can't disambiguate (see the file's own comment on
    // why distance is used), so this locks in that distance is what decides.
    const c1 = row({ id: 'c1', strava_id: -1, source: 'concept2', distance: 500, moving_time: 120 })
    const c2 = row({ id: 'c2', strava_id: -2, source: 'concept2', distance: 5000, moving_time: 1200 })
    const g1 = row({ id: 'g1', strava_id: 500, source: 'garmin', distance: 520, moving_time: 130 })
    const g2 = row({ id: 'g2', strava_id: 600, source: 'garmin', distance: 4900, moving_time: 1180 })
    const { groups } = splitMergedPairs([c1, c2, g1, g2])
    expect(groups).toHaveLength(2)
    const byPrimary = new Map(groups.map(g => [g.primary.id, g.partners.map(p => p.id)]))
    expect(byPrimary.get('c1')).toEqual(['g1'])
    expect(byPrimary.get('c2')).toEqual(['g2'])
  })

  it('never merges rows from different sports even on the same day', () => {
    const c = row({ id: 'c', strava_id: -1, sport_type: 'Rowing' })
    const g = row({ id: 'g', strava_id: 500, sport_type: 'Run' })
    const { singles, groups } = splitMergedPairs([c, g])
    expect(groups).toHaveLength(0)
    expect(singles).toHaveLength(2)
  })

  it('merges all three when the same session syncs from Garmin, Concept2 AND Strava at once', () => {
    // The exact real-world case that prompted this generalization: Daniel's
    // own passes sync to all three simultaneously (Garmin auto-forwards to
    // Strava while Concept2 syncs the erg session directly) — the old
    // pairwise-only logic could only ever combine two of the three, leaving
    // the third sitting as a phantom duplicate everywhere stats are shown.
    const c = row({ id: 'c', strava_id: -1, source: 'concept2', distance: 5000, moving_time: 1200 })
    const g = row({ id: 'g', strava_id: 500, source: 'garmin', distance: 5050, moving_time: 1210 })
    const s = row({ id: 's', strava_id: 999999999, source: 'strava', distance: 5040, moving_time: 1205 })
    const { singles, groups } = splitMergedPairs([c, g, s])
    expect(singles).toHaveLength(0)
    expect(groups).toHaveLength(1)
    expect(groups[0].primary.id).toBe('c') // Concept2 preferred as primary
    expect(groups[0].partners.map(p => p.id).sort()).toEqual(['g', 's'])
  })

  it('does not chain two distinct same-day sessions together through a third row that loosely matches both', () => {
    // A safety check on the clustering: only merge into a cluster when a row
    // is a valid match against EVERY existing member, not just one — so a
    // borderline row can't transitively link two genuinely different
    // sessions just because it happens to match both individually.
    const a = row({ id: 'a', strava_id: -1, source: 'concept2', distance: 4000, moving_time: 1000 })
    const b = row({ id: 'b', strava_id: 500, source: 'garmin', distance: 5000, moving_time: 1250 }) // ~25% off a, within tolerance
    const c = row({ id: 'c', strava_id: 999999999, source: 'strava', distance: 6200, moving_time: 1550 }) // ~25% off b, but ~55% off a
    expect(isMergeCandidate(a, b)).toBe(true)
    expect(isMergeCandidate(b, c)).toBe(true)
    expect(isMergeCandidate(a, c)).toBe(false)
    const { groups, singles } = splitMergedPairs([a, b, c])
    // a+b merge (closest pair), c is left unmerged rather than dragged into
    // a's group through b.
    expect(groups).toHaveLength(1)
    expect(groups[0].primary.id).toBe('a')
    expect(groups[0].partners.map(p => p.id)).toEqual(['b'])
    expect(singles.map(x => x.id)).toEqual(['c'])
  })
})

describe('bestMergePartners', () => {
  it('returns the closest match per other source, not just the single overall closest', () => {
    const activity = row({ id: 'g', strava_id: 500, source: 'garmin', distance: 5000, moving_time: 1200 })
    const concept2 = row({ id: 'c', strava_id: -1, source: 'concept2', distance: 5050, moving_time: 1210 })
    const strava = row({ id: 's', strava_id: 999999999, source: 'strava', distance: 5100, moving_time: 1220 })
    const partners = bestMergePartners(activity, [concept2, strava])
    expect(partners.map(p => p.id).sort()).toEqual(['c', 's'])
  })

  it('returns an empty array when nothing matches', () => {
    const activity = row({ id: 'g', strava_id: 500, source: 'garmin' })
    const unrelated = row({ id: 'x', strava_id: 999, source: 'garmin', sport_type: 'Run' })
    expect(bestMergePartners(activity, [unrelated])).toEqual([])
  })
})

describe('isCleanCrossSourceGroup', () => {
  it('is true for a real Garmin+Concept2+Strava trio', () => {
    const c = row({ id: 'c', strava_id: -1, source: 'concept2', distance: 5000, moving_time: 1200 })
    const g = row({ id: 'g', strava_id: 500, source: 'garmin', distance: 5050, moving_time: 1210 })
    const s = row({ id: 's', strava_id: 999999999, source: 'strava', distance: 5040, moving_time: 1205 })
    expect(isCleanCrossSourceGroup([c, g, s])).toBe(true)
  })

  it('is false when two rows share the same source', () => {
    const g1 = row({ id: 'g1', strava_id: 500, source: 'garmin' })
    const g2 = row({ id: 'g2', strava_id: 501, source: 'garmin' })
    expect(isCleanCrossSourceGroup([g1, g2])).toBe(false)
  })

  it('is false when a manual row is in the group', () => {
    const g = row({ id: 'g', strava_id: 500, source: 'garmin' })
    const m = row({ id: 'm', strava_id: -999, source: 'manual' })
    expect(isCleanCrossSourceGroup([g, m])).toBe(false)
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

  it('copies the Garmin partner\'s hr_zones onto the surviving Concept2 row', () => {
    // The actual regression this session fixed: "Veckans pulszoner" silently
    // lost zone data for every merged pair because only the surviving row's
    // own hr_zones was ever read afterward.
    const c = row({ id: 'c', strava_id: -1, hr_zones: undefined })
    const g = row({ id: 'g', strava_id: 500, hr_zones: { z1: 100, z2: 200 } })
    const result = dedupeForStats([c, g])
    expect(result).toHaveLength(1)
    expect(result[0].hr_zones).toEqual({ z1: 100, z2: 200 })
  })

  it('does not overwrite hr_zones the primary row already has', () => {
    const c = row({ id: 'c', strava_id: -1, hr_zones: { z1: 999 } })
    const g = row({ id: 'g', strava_id: 500, hr_zones: { z1: 1 } })
    const result = dedupeForStats([c, g])
    expect(result[0].hr_zones).toEqual({ z1: 999 })
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
