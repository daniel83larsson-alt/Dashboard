import { dedupeForStats } from './duplicates'

// Egna pass som synkas från flera källor (t.ex. Garmin + Concept2) visade sig dubblerade i
// vännernas flöde (Daniel: "Nackdel när mina 2 pass synkas. Att de visas som 2"), eftersom
// friend_activity_feed() returnerar råa rader. Grupperar per owner_id (två olika vänners pass
// ska aldrig kunna matcha varandra) innan dedup, slår sen ihop och klipper till de 10 senaste —
// RPC:n hämtar redan upp till 40 råa rader så att dedupen inte tränger ut äldre, unika pass.
export type FriendFeedRow = {
  activity_id: string
  owner_id: string
  owner_name: string
  sport_type: string
  activity_name: string
  distance: number
  moving_time: number
  start_date: string
  kudos_count: number
  liked_by_me: boolean
  source?: string
  strava_id?: number
}

export function dedupeFriendFeed(rawFeed: FriendFeedRow[] | null): FriendFeedRow[] {
  const byOwner = new Map<string, FriendFeedRow[]>()
  for (const row of rawFeed ?? []) {
    const list = byOwner.get(row.owner_id) ?? []
    list.push(row)
    byOwner.set(row.owner_id, list)
  }
  return Array.from(byOwner.values())
    .flatMap(rows => dedupeForStats(rows.map(r => ({ ...r, id: r.activity_id, strava_id: r.strava_id ?? 0 }))))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, 10)
}
