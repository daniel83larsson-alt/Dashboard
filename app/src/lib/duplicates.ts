// Only id/strava_id/start_date/distance/moving_time/sport_type/hr_zones are
// actually read by this file's merge/dedup logic (isMergeCandidate,
// splitMergedPairs, dedupeForStats) — name/average_heartrate/description are
// used only by suggestKeepId (the duplicate-cleanup flow), which already
// null-guards both, so they're optional here rather than forcing every
// caller to select columns it doesn't need just to satisfy the type.
// hr_zones is the ONLY part of raw_data any of this needs — callers select
// it as `hr_zones:raw_data->hrZones` instead of the full column, since
// raw_data (the entire cached Garmin/Concept2 API response) can run
// multiple KB per row and a full activity list is otherwise several MB.
export type ActivityRow = {
  id: string
  strava_id: number
  start_date: string
  distance: number
  moving_time: number
  sport_type: string
  name?: string
  average_heartrate?: number | null
  description?: string | null
  created_at?: string
  hr_zones?: unknown
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

// Used only for merging a Concept2+Garmin pair for display (Passlogg list,
// dashboard stats, Rekord, the detail page) — NOT for the same-source
// duplicate-cleanup flow above, which needs isFuzzyMatch's tighter 5%
// tolerance since a false positive there risks deleting a real, distinct
// session. Interval-style Concept2 workouts (e.g. "4x3:00/2:00r") are
// recorded very differently by each source: Concept2's own total often
// excludes rest time entirely while Garmin's moving-time includes some of
// it, producing 20-30% swings in distance/duration for what's genuinely
// the same session — a looser tolerance is needed here specifically, with
// a small absolute floor so a few seconds of jitter on very short passes
// doesn't block the merge.
export function isMergeCandidate(a: ActivityRow, b: ActivityRow): boolean {
  if (a.id === b.id) return false
  if (a.sport_type !== b.sport_type) return false
  if (a.start_date.slice(0, 10) !== b.start_date.slice(0, 10)) return false
  if ((a.strava_id >= 0) === (b.strava_id >= 0)) return false // must be opposite sources

  const distOk = a.distance > 0 && b.distance > 0
    ? Math.abs(a.distance - b.distance) / Math.max(a.distance, b.distance) < 0.3
    : a.distance === b.distance

  const timeDiff = Math.abs(a.moving_time - b.moving_time)
  const timeOk = a.moving_time > 0 && b.moving_time > 0
    ? timeDiff / Math.max(a.moving_time, b.moving_time) < 0.35 || timeDiff <= 10
    : a.moving_time === b.moving_time

  return distOk && timeOk
}

// Among all merge candidates for a single activity, pick the one whose
// distance is closest. Distance is the more stable signal when a day has
// more than one real session from each source (e.g. a short test pull and
// a real workout both logged twice) — moving_time is exactly what the
// rest-time accounting difference above throws off, so it can't reliably
// tell two same-day sessions apart the way distance can.
export function bestMergePartner<T extends ActivityRow>(a: T, candidates: T[]): T | null {
  const matches = candidates.filter(b => isMergeCandidate(a, b))
  if (!matches.length) return null
  return matches.reduce((best, cur) =>
    Math.abs(cur.distance - a.distance) < Math.abs(best.distance - a.distance) ? cur : best
  )
}

export type MergedPair<T extends ActivityRow> = { primary: T; partner: T }

// Splits activities into a) genuine Concept2+Garmin pairs for the SAME
// session, which should be treated as one pass everywhere distance/time
// gets summed or counted, and b) everything else (unmatched activities,
// plus same-source duplicate groups — those are real dupes to delete via
// DuplicateCleanup, not two complementary sources to merge). Groups by
// day+sport first, then greedily pairs each Concept2 row with its
// closest-by-distance unclaimed Garmin row within that group — needed
// because a single day can have more than one real session per sport
// (see isMergeCandidate), so pairing can't just assume one candidate each.
export function splitMergedPairs<T extends ActivityRow>(activities: T[]): { singles: T[]; pairs: MergedPair<T>[] } {
  const merged = new Set<string>()
  const pairs: MergedPair<T>[] = []

  const byDaySport = new Map<string, T[]>()
  for (const a of activities) {
    const key = `${a.start_date.slice(0, 10)}|${a.sport_type}`
    const arr = byDaySport.get(key) ?? []
    arr.push(a)
    byDaySport.set(key, arr)
  }

  for (const group of byDaySport.values()) {
    const concept2 = group.filter(a => a.strava_id < 0)
    const garmin = group.filter(a => a.strava_id >= 0)
    const candidates = concept2
      .flatMap(c => garmin.filter(g => isMergeCandidate(c, g)).map(g => ({ c, g, distDiff: Math.abs(c.distance - g.distance) })))
      .sort((x, y) => x.distDiff - y.distDiff)

    const usedC = new Set<string>()
    const usedG = new Set<string>()
    for (const { c, g } of candidates) {
      if (usedC.has(c.id) || usedG.has(g.id)) continue
      pairs.push({ primary: c, partner: g })
      usedC.add(c.id)
      usedG.add(g.id)
      merged.add(c.id)
      merged.add(g.id)
    }
  }

  return { singles: activities.filter(a => !merged.has(a.id)), pairs }
}

// One row per real session for stats: merged pairs count once (using the
// more precise Concept2 distance/time), so total km/pass counts and PRs
// don't double a workout that happened to sync from two sources. Keeps the
// caller's original ordering (callers rely on this already being sorted by
// start_date, e.g. activities[0] as "latest pass").
//
// Concept2 never has HR-zone data (only Garmin's watch does) — so the
// kept Concept2 row is patched with the dropped Garmin partner's hr_zones
// before being returned. Without this, "Veckans pulszoner" silently lost
// zone data for every single merged pair, since aggregateZones only ever
// sees the surviving row's own hr_zones.
// A session under a minute is almost certainly an accidental sync fragment
// (a few strokes before stopping the machine, not real training) rather than
// a legitimate short pass — same 60s floor lib/records.ts already uses for
// PR-eligibility. These fragments are usually too small to satisfy even
// isMergeCandidate's loose tolerance, so they'd otherwise survive as extra
// "singles" and inflate every pass count downstream. Filtered only here, not
// in splitMergedPairs, so the raw Passlogg list still shows every synced row
// for manual cleanup — only the derived counts/totals exclude junk.
const MIN_REAL_SESSION_SECONDS = 60

export function dedupeForStats<T extends ActivityRow>(activities: T[]): T[] {
  const { pairs } = splitMergedPairs(activities)
  const dropped = new Set(pairs.map(p => p.partner.id))
  const zonesByPrimaryId = new Map<string, unknown>()
  for (const p of pairs) {
    if (!p.primary.hr_zones && p.partner.hr_zones) zonesByPrimaryId.set(p.primary.id, p.partner.hr_zones)
  }
  return activities
    .filter(a => !dropped.has(a.id) && a.moving_time >= MIN_REAL_SESSION_SECONDS)
    .map(a => {
      const zones = zonesByPrimaryId.get(a.id)
      if (!zones) return a
      return { ...a, hr_zones: zones } as T
    })
}
