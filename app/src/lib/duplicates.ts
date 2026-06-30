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

function isFuzzyMatch(a: ActivityRow, b: ActivityRow): boolean {
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
