import { dedupeForStats, isMergeCandidate, type ActivityRow } from './duplicates'
import { newRecordsForLatest } from './records'

// Daniel: "När en använder slår rekord, ska dens pass taggas med en
// rekordmärke i 'vän' listan ... Så att man ännu mer kan peppa och lika
// någons prestation." Pure — no I/O, same contract as friend-week.ts. The
// caller fetches a friend's history through the EXISTING friend_weekly_
// activities RPC (its date bounds are caller-chosen, and it's already
// limited to accepted friends), so this adds no new way to read another
// person's data.
//
// "Rekord" means exactly what it already means for your OWN latest pass on
// Översikt (records.ts's newRecordsForLatest: fastest 1/3/5/10 km, best
// 20/30/45 min, longest session ever) — reused, not re-implemented, so a
// friend's badge and your own medal can never disagree about what counts.
//
// Each pass is compared only against THAT SAME PERSON's earlier passes: it
// answers "was this a personal best when they did it", never "is it the
// best among my friends". Because "earlier" is what's compared, a badge is
// stable — someone beating the same record a week later doesn't quietly
// remove the badge from the pass that first set it.

// The columns friend_weekly_activities() returns that this needs (it
// returns a few more — owner_name — that are irrelevant here).
export type FriendHistoryRow = {
  activity_id: string
  owner_id: string
  sport_type: string
  distance: number
  moving_time: number
  start_date: string
  source?: string | null
  strava_id?: number | null
}

// activity_id → what it was a record in (e.g. ["Snabbaste 5 km"]). A pass
// that wasn't a record is simply absent from the map.
export function friendRecordBadges(history: FriendHistoryRow[], feed: FriendHistoryRow[]): Map<string, string[]> {
  const toRow = (r: FriendHistoryRow): ActivityRow => ({
    // activity_id → id: what dedupeForStats/ActivityRow expect. A plain cast
    // wouldn't rename the field, and every row would silently share the same
    // undefined id (same trap page.tsx's weekly mapping already documents).
    id: r.activity_id,
    strava_id: r.strava_id ?? 0,
    start_date: r.start_date,
    distance: r.distance,
    moving_time: r.moving_time,
    sport_type: r.sport_type,
    source: r.source ?? undefined,
  })

  const rowsByOwner = new Map<string, ActivityRow[]>()
  for (const h of history) {
    const list = rowsByOwner.get(h.owner_id) ?? []
    list.push(toRow(h))
    rowsByOwner.set(h.owner_id, list)
  }

  // One row per REAL session per person (a Garmin + Concept2 pair of the
  // same rowing pass counts once) — otherwise a pass's own sync twin would
  // sit in its "earlier passes" list and could hide a genuine record, or
  // (in the other order) be treated as an earlier, equal-or-better pass.
  const sessionsByOwner = new Map<string, ActivityRow[]>()
  for (const [owner, rows] of rowsByOwner) {
    sessionsByOwner.set(
      owner,
      dedupeForStats(rows).sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date)),
    )
  }

  const badges = new Map<string, string[]>()
  for (const entry of feed) {
    const sessions = sessionsByOwner.get(entry.owner_id)
    if (!sessions) continue

    // Normally the feed entry IS one of the deduped sessions (both sides ran
    // the same dedupe). If the feed showed the OTHER half of a synced pair
    // than the one that survived here, match it to its surviving partner.
    const entryRow = toRow(entry)
    const session = sessions.find(s => s.id === entry.activity_id)
      ?? sessions.find(s => isMergeCandidate(entryRow, s))
    if (!session) continue

    const sessionTime = Date.parse(session.start_date)
    const earlier = sessions.filter(s => s.id !== session.id && Date.parse(s.start_date) < sessionTime)
    const labels = newRecordsForLatest(session, earlier)
    if (labels.length > 0) badges.set(entry.activity_id, labels)
  }
  return badges
}
