import { dedupeForStats, type ActivityRow } from './duplicates'

// Daniel: "vänner total tid och km vecka... liten per vän. Så man kan se,
// hur länge och långt, någon tränat." Pure aggregation over the two RPC
// results (lib/supabase's friend_roster/friend_weekly_activities) — kept
// separate from lib/load.ts's weeklyMinutes/weeklyLoad, which are about
// the CURRENT user's own training, not a roster of other people's.
export type FriendWeekSummary = {
  ownerId: string
  ownerName: string
  totalMovingTimeSec: number
  totalDistanceM: number
  activityCount: number
}

export function summarizeFriendWeek(
  activities: (ActivityRow & { owner_id: string; owner_name: string })[],
  roster: { owner_id: string; owner_name: string }[],
): FriendWeekSummary[] {
  const byOwner = new Map<string, (ActivityRow & { owner_id: string; owner_name: string })[]>()
  for (const a of activities) {
    const list = byOwner.get(a.owner_id) ?? []
    list.push(a)
    byOwner.set(a.owner_id, list)
  }

  const summaries = roster.map(r => {
    const rows = byOwner.get(r.owner_id) ?? []
    // Same dedup as the logged-in user's own weekly totals — a friend with
    // both Garmin and Concept2 connected would otherwise have a merged
    // rowing session counted twice, exactly the bug dedupeForStats already
    // exists to fix (see lib/duplicates.ts).
    const deduped = dedupeForStats(rows)
    return {
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      totalMovingTimeSec: deduped.reduce((s, a) => s + a.moving_time, 0),
      totalDistanceM: deduped.reduce((s, a) => s + a.distance, 0),
      activityCount: deduped.length,
    }
  })

  // Most active first — reads naturally as a lightweight leaderboard
  // without needing to build one.
  return summaries.sort((a, b) => b.totalMovingTimeSec - a.totalMovingTimeSec)
}
