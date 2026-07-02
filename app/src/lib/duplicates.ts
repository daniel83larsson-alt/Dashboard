export type ActivityRow = {
  id: string
  strava_id: number
  start_date: string
  distance: number
  moving_time: number
  sport_type: string
  name: string
  average_heartrate: number | null
  description: string | null
  created_at?: string
}

// Exported so the activity-detail page can find the matching Garmin/Concept2
// counterpart for a single pass and merge their data, without re-running the
// full-list scan findDuplicateGroups does.
export function isFuzzyMatch(a: ActivityRow, b: ActivityRow): boolean {
  if (a.id === b.id) return false
  if (a.sport_type !== b.sport_type) return false
  if (a.start_date.slice(0, 10) !== b.start_date.slice(0, 10)) return false

  const distOk = a.distance > 0 && b.distance > 0
    ? Math.abs(a.distance - b.distance) / Math.max(a.distance, b.distance) < 0.05
    : a.distance === b.distance

  const timeOk = a.moving_time > 0 && b.moving_time > 0
    ? Math.abs(a.moving_time - b.moving_time) / Math.max(a.moving_time, b.moving_time) < 0.05
    : a.moving_time === b.moving_time

  return distOk && timeOk
}

// Groups activities that look like the same real-world workout synced from
// more than one source (e.g. Concept2 + Garmin both logging the same row).
export function findDuplicateGroups(activities: ActivityRow[]): ActivityRow[][] {
  const seen = new Set<string>()
  const groups: ActivityRow[][] = []

  for (const a of activities) {
    if (seen.has(a.id)) continue
    const group = activities.filter(b => b.id === a.id || isFuzzyMatch(a, b))
    if (group.length > 1) {
      group.forEach(g => seen.add(g.id))
      groups.push(group.sort((x, y) => x.start_date.localeCompare(y.start_date)))
    }
  }

  return groups
}

// Suggests which activity in a duplicate group to keep: prefer the one with
// heart-rate data, falling back to the most recently created row.
export function suggestKeepId(group: ActivityRow[]): string {
  const withHr = group.filter(a => a.average_heartrate != null)
  const pool = withHr.length ? withHr : group
  return pool.reduce((best, cur) =>
    (cur.created_at ?? '') > (best.created_at ?? '') ? cur : best
  ).id
}

export type MergedPair<T extends ActivityRow> = { primary: T; partner: T }

// Splits activities into a) genuine Concept2+Garmin pairs for the SAME
// session, which should be treated as one pass everywhere distance/time
// gets summed or counted, and b) everything else (unmatched activities,
// plus same-source duplicate groups — those are real dupes to delete via
// DuplicateCleanup, not two complementary sources to merge). Only exact
// 1-Garmin + 1-Concept2 groups are merged; anything ambiguous (3+ way ties,
// two Garmin rows, etc.) is left alone rather than guessed at.
export function splitMergedPairs<T extends ActivityRow>(activities: T[]): { singles: T[]; pairs: MergedPair<T>[] } {
  const groups = findDuplicateGroups(activities)
  const merged = new Set<string>()
  const pairs: MergedPair<T>[] = []

  for (const group of groups) {
    const garmin = group.filter(a => a.strava_id >= 0)
    const concept2 = group.filter(a => a.strava_id < 0)
    if (garmin.length === 1 && concept2.length === 1) {
      const primary = activities.find(a => a.id === concept2[0].id)!
      const partner = activities.find(a => a.id === garmin[0].id)!
      pairs.push({ primary, partner })
      merged.add(primary.id)
      merged.add(partner.id)
    }
  }

  return { singles: activities.filter(a => !merged.has(a.id)), pairs }
}

// One row per real session for stats: merged pairs count once (using the
// more precise Concept2 distance/time), so total km/pass counts and PRs
// don't double a workout that happened to sync from two sources. Keeps the
// caller's original ordering (callers rely on this already being sorted by
// start_date, e.g. activities[0] as "latest pass").
export function dedupeForStats<T extends ActivityRow>(activities: T[]): T[] {
  const { pairs } = splitMergedPairs(activities)
  const dropped = new Set(pairs.map(p => p.partner.id))
  return activities.filter(a => !dropped.has(a.id))
}
