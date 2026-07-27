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
  // Optional on purpose — most callers only need it for the garmin/concept2
  // split inside splitMergedPairs(), not for their own logic, so they're not
  // forced to add it to every select() just to satisfy the type. See
  // rowSource() below for what happens when it's omitted.
  source?: string
}

// The sync sources that can legitimately be the SAME real session arriving
// twice (or three times — see isMergeCandidate/splitMergedPairs) rather than
// a genuinely separate workout. 'manual' and any unrecognized value fall
// through to 'other' below and never merge with anything — a user-entered
// pass isn't a sync duplicate of something else.
export type KnownSource = 'garmin' | 'concept2' | 'strava' | 'polar'
const KNOWN_SOURCES: readonly KnownSource[] = ['garmin', 'concept2', 'strava', 'polar']

// Ground truth for "which sync source is this row from" WHEN the caller's
// select() included the `source` column. If it didn't (most existing call
// sites don't, and aren't required to — see ActivityRow above), this falls
// back to the legacy strava_id-SIGN heuristic (Garmin: real positive id,
// Concept2: -1×real id). That fallback is exactly right for every row that
// existed before Strava/Polar shipped (all backfilled correctly, see
// schema.sql) but can misjudge a Strava row (real positive id) as "garmin"
// or a Polar row as either, IF AND ONLY IF a call site that omits `source`
// also happens to run splitMergedPairs()/dedupeForStats() over a mix that
// includes real Strava/Polar rows. Worst case there is cosmetic (a stats
// aggregate might treat an unrelated same-day/sport Strava+Concept2 pair as
// one merged session instead of two) — never a data leak. The four routes
// that call a specific vendor's API using strava_id as that vendor's real
// activity id (garmin-zones, garmin-route, concept2-detail, and the
// Passlogg detail page that picks between them) all select `source`
// explicitly and never rely on this fallback, since a wrong guess there
// means calling Garmin's API with a Strava id — a real functional bug, not
// just an imprecise aggregate.
export function rowSource(a: ActivityRow): KnownSource | 'other' {
  if (a.source) return (KNOWN_SOURCES as readonly string[]).includes(a.source) ? (a.source as KnownSource) : 'other'
  return a.strava_id >= 0 ? 'garmin' : 'concept2'
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

// Used for merging a same-session cross-source group for display (Passlogg
// list, dashboard stats, Rekord, the detail page) — NOT for the same-source
// duplicate-cleanup flow above, which needs isFuzzyMatch's tighter 5%
// tolerance since a false positive there risks deleting a real, distinct
// session. Any two of Garmin/Concept2/Strava/Polar can be a real same-session
// pair — e.g. Garmin auto-forwarding to Strava while Concept2 syncs the same
// erg session directly, a genuinely common combination once more than one
// provider is connected, not just Concept2+Garmin. 'manual' and unrecognized
// sources ('other') never merge with anything — see rowSource(). Interval-
// style Concept2 workouts (e.g. "4x3:00/2:00r") are recorded very differently
// by each source: Concept2's own total often excludes rest time entirely
// while Garmin's moving-time includes some of it, producing 20-30% swings in
// distance/duration for what's genuinely the same session — a looser
// tolerance is needed here specifically, with a small absolute floor so a
// few seconds of jitter on very short passes doesn't block the merge.
export function isMergeCandidate(a: ActivityRow, b: ActivityRow): boolean {
  if (a.id === b.id) return false
  if (a.sport_type !== b.sport_type) return false
  if (a.start_date.slice(0, 10) !== b.start_date.slice(0, 10)) return false
  const aSource = rowSource(a)
  const bSource = rowSource(b)
  if (aSource === 'other' || bSource === 'other') return false // manual/unknown never merges
  if (aSource === bSource) return false // must be from different sources

  const distOk = a.distance > 0 && b.distance > 0
    ? Math.abs(a.distance - b.distance) / Math.max(a.distance, b.distance) < 0.3
    : a.distance === b.distance

  const timeDiff = Math.abs(a.moving_time - b.moving_time)
  const timeOk = a.moving_time > 0 && b.moving_time > 0
    ? timeDiff / Math.max(a.moving_time, b.moving_time) < 0.35 || timeDiff <= 10
    : a.moving_time === b.moving_time

  return distOk && timeOk
}

// Among all merge candidates for a single activity, pick the closest match
// PER OTHER SOURCE present among the candidates — not just the single overall
// closest one. A real session can now legitimately arrive from three or four
// sources at once (Daniel's own passes sync Garmin + Concept2 + Strava
// simultaneously, since Garmin auto-forwards to Strava), so an activity can
// have more than one merge partner. Grouping by source first (then picking
// the closest-by-distance within each) still guards against the original
// problem this was built for — a day with two real sessions from the SAME
// source (e.g. a short test pull and a real workout both logged twice) —
// since isMergeCandidate already forbids two same-source rows from matching
// each other, each source bucket here only ever contains genuine candidates
// for THIS activity, and distance is the stable tiebreaker within it
// (moving_time is exactly what the rest-time accounting difference in
// isMergeCandidate throws off, so it can't reliably disambiguate).
export function bestMergePartners<T extends ActivityRow>(a: T, candidates: T[]): T[] {
  const matches = candidates.filter(b => isMergeCandidate(a, b))
  const bySource = new Map<string, T[]>()
  for (const m of matches) {
    const key = rowSource(m)
    const arr = bySource.get(key) ?? []
    arr.push(m)
    bySource.set(key, arr)
  }
  return Array.from(bySource.values()).map(rows =>
    rows.reduce((best, cur) => Math.abs(cur.distance - a.distance) < Math.abs(best.distance - a.distance) ? cur : best)
  )
}

export type MergedGroup<T extends ActivityRow> = { primary: T; partners: T[] }

// Deterministic pick of which row in a merged group is "primary" (the one
// stats/counts keep) — Concept2's distance/pace is the most precise when
// present, Garmin's watch data next-best, otherwise whichever of Strava/Polar
// showed up, otherwise just the first row in the group's original order.
// Matters because dedupeForStats always keeps the primary and drops the rest.
function pickPrimary<T extends ActivityRow>(members: T[]): T {
  for (const source of ['concept2', 'garmin', 'strava', 'polar'] as const) {
    const found = members.find(m => rowSource(m) === source)
    if (found) return found
  }
  return members[0]
}

// Splits activities into a) genuine cross-source groups for the SAME session
// (two OR MORE of Garmin/Concept2/Strava/Polar all syncing one real workout —
// see isMergeCandidate), which should be treated as one pass everywhere
// distance/time gets summed or counted, and b) everything else (unmatched
// activities, plus same-source duplicate groups — those are real dupes to
// delete via DuplicateCleanup, not complementary sources to merge). Groups by
// day+sport first, then builds clusters from closest-distance-first pairwise
// matches — a cluster only grows by merging in a row that's a valid
// isMergeCandidate match against EVERY existing member (a full clique, not
// just a chain), so two unrelated same-day sessions can never get linked
// transitively through a third row that loosely matched both.
export function splitMergedPairs<T extends ActivityRow>(activities: T[]): { singles: T[]; groups: MergedGroup<T>[] } {
  const merged = new Set<string>()
  const mergedGroups: MergedGroup<T>[] = []

  const byDaySport = new Map<string, T[]>()
  for (const a of activities) {
    const key = `${a.start_date.slice(0, 10)}|${a.sport_type}`
    const arr = byDaySport.get(key) ?? []
    arr.push(a)
    byDaySport.set(key, arr)
  }

  for (const group of byDaySport.values()) {
    const edges: { i: number; j: number; distDiff: number }[] = []
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (isMergeCandidate(group[i], group[j])) {
          edges.push({ i, j, distDiff: Math.abs(group[i].distance - group[j].distance) })
        }
      }
    }
    edges.sort((x, y) => x.distDiff - y.distDiff)

    // clusters[c] = list of row-indices in cluster c; clusterOf[i] = which
    // cluster row i currently belongs to. Clusters get emptied (not removed)
    // when merged into another, so indices stay stable while iterating.
    const clusters: number[][] = group.map((_, i) => [i])
    const clusterOf = group.map((_, i) => i)

    for (const { i, j } of edges) {
      const ci = clusterOf[i]
      const cj = clusterOf[j]
      if (ci === cj) continue
      const clusterI = clusters[ci]
      const clusterJ = clusters[cj]
      const compatible = clusterI.every(x => clusterJ.every(y => isMergeCandidate(group[x], group[y])))
      if (!compatible) continue

      clusters[ci] = [...clusterI, ...clusterJ]
      clusters[cj] = []
      for (const idx of clusterJ) clusterOf[idx] = ci
    }

    for (const cluster of clusters) {
      if (cluster.length < 2) continue
      const members = cluster.map(idx => group[idx])
      const primary = pickPrimary(members)
      mergedGroups.push({ primary, partners: members.filter(m => m.id !== primary.id) })
    }
  }

  for (const g of mergedGroups) {
    merged.add(g.primary.id)
    g.partners.forEach(p => merged.add(p.id))
  }

  return { singles: activities.filter(a => !merged.has(a.id)), groups: mergedGroups }
}

// True when a same-fuzzy-match group (from findDuplicateGroups, tight 5%
// tolerance) is exactly the "one real session synced from N different
// providers" shape that splitMergedPairs/dedupeForStats already merge live
// for display — every row a distinct known sync source, every pair a valid
// isMergeCandidate match. Used by the manual duplicate-scan route and the
// automatic cleanup cron to exempt that shape from deletion, since deleting
// either half would silently break the live merge (and, for the Garmin half
// specifically, break the garmin-zones/garmin-route detail routes that need
// a real Garmin strava_id to call Garmin's API). A group that DOESN'T fully
// satisfy this — two rows from the same source, or a "tie" where only some
// pairs match — still needs the delete flow; this only exempts the clean
// case, same as before this was generalized past just Garmin+Concept2.
export function isCleanCrossSourceGroup(group: ActivityRow[]): boolean {
  if (group.length < 2) return false
  const sources = group.map(rowSource)
  if (sources.some(s => s === 'other')) return false
  if (new Set(sources).size !== sources.length) return false // two rows share a source
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (!isMergeCandidate(group[i], group[j])) return false
    }
  }
  return true
}

// One row per real session for stats: merged groups count once (using the
// pickPrimary() preference order above), so total km/pass counts and PRs
// don't double a workout that happened to sync from more than one source.
// Keeps the caller's original ordering (callers rely on this already being
// sorted by start_date, e.g. activities[0] as "latest pass").
//
// Concept2/Strava never have HR-zone data of their own (only Garmin's watch
// does) — so the kept row is patched with the first partner's hr_zones (if
// any) before being returned. Without this, "Veckans pulszoner" silently
// lost zone data for every merged group, since aggregateZones only ever sees
// the surviving row's own hr_zones.
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
  const { groups } = splitMergedPairs(activities)
  const dropped = new Set(groups.flatMap(g => g.partners.map(p => p.id)))
  const zonesByPrimaryId = new Map<string, unknown>()
  for (const g of groups) {
    if (g.primary.hr_zones) continue
    const withZones = g.partners.find(p => p.hr_zones)
    if (withZones) zonesByPrimaryId.set(g.primary.id, withZones.hr_zones)
  }
  return activities
    .filter(a => !dropped.has(a.id) && a.moving_time >= MIN_REAL_SESSION_SECONDS)
    .map(a => {
      const zones = zonesByPrimaryId.get(a.id)
      if (!zones) return a
      return { ...a, hr_zones: zones } as T
    })
}
