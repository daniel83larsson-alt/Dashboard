import type { SupabaseClient } from '@supabase/supabase-js'
import type { FriendHistoryRow } from './friend-records'

// Every accepted friend's full activity history (only the columns
// friend_weekly_activities() returns: sport, date, distance, time, source —
// no names of passes, no GPS, no heart rate), fetched through the SAME RPC
// the "Vänner denna vecka" card already uses, just with an unbounded date
// range. That RPC already takes caller-chosen dates and is already limited to
// accepted friends inside the database, so this adds no new way to read
// anyone's data — see lib/friend-records.ts for what it's used for.
//
// PostgREST returns at most 1000 rows per request (the project default), so
// this pages until a short page comes back. It reports whether it actually
// got EVERYTHING: a truncated history would make old personal bests look
// like they never happened, and a mediocre pass would then get a false
// record badge — so the caller shows no badges at all rather than wrong
// ones whenever `complete` is false.
const PAGE_SIZE = 1000
const MAX_PAGES = 20 // 20 000 rows — far beyond any realistic friend list; a hard stop against a runaway loop
const EPOCH = '1970-01-01T00:00:00Z'
const FAR_FUTURE = '2100-01-01T00:00:00Z'

export async function fetchFriendHistory(supabase: SupabaseClient): Promise<{ data: FriendHistoryRow[]; complete: boolean }> {
  const byId = new Map<string, FriendHistoryRow>()

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .rpc('friend_weekly_activities', { week_start: EPOCH, week_end: FAR_FUTURE })
      .range(from, from + PAGE_SIZE - 1)
    if (error || !data) return { data: [...byId.values()], complete: false }

    const rows = data as FriendHistoryRow[]
    // Keyed by id so a row that lands on a page boundary twice (the RPC's
    // ordering can tie on identical timestamps) can't become its own
    // "earlier tie" and hide a genuine record.
    for (const r of rows) byId.set(r.activity_id, r)
    if (rows.length < PAGE_SIZE) return { data: [...byId.values()], complete: true }
  }
  return { data: [...byId.values()], complete: false }
}
