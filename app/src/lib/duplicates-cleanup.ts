import type { SupabaseClient } from '@supabase/supabase-js'
import { findDuplicateGroups, suggestKeepId } from '@/lib/duplicates'

type RawData = { hrZones?: unknown; split?: unknown; [key: string]: unknown }

// Scans all of a user's activities for fuzzy-matched duplicates (same day,
// sport, distance/time within 5%) and keeps one row per group, deleting the
// rest. Before deleting, copies over anything worth preserving from the
// losing rows (Garmin's HR zones, Concept2's split data, watts) onto the
// survivor so switching which source "wins" never throws away data. Runs
// automatically on every sync so duplicates never accumulate.
//
// EXCEPT: a clean 1-Garmin + 1-Concept2 pair for the same session is no
// longer deleted here — Passlogg, the dashboard, and the detail page all
// merge that pair live for display (splitMergedPairs/dedupeForStats in
// duplicates.ts) using each row's own API route (garmin-zones needs a real
// Garmin strava_id, concept2-detail needs a real Concept2 one). Deleting
// either half would silently break that merge and make the copied-over
// field unreachable anyway, since those routes gate on strava_id sign, not
// on raw_data contents. This function now only cleans up genuine same-
// source duplicates (double-syncs) and 3+-way ties, which the display
// merge doesn't handle and which really are just redundant rows.
export async function autoCleanupDuplicates(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: activities } = await supabase
    .from('activities')
    .select('id, strava_id, start_date, distance, moving_time, sport_type, name, average_heartrate, description, created_at')
    .eq('user_id', userId)

  if (!activities?.length) return 0

  const groups = findDuplicateGroups(activities).filter(group => {
    const garmin = group.filter(a => a.strava_id >= 0)
    const concept2 = group.filter(a => a.strava_id < 0)
    return !(garmin.length === 1 && concept2.length === 1)
  })
  if (!groups.length) return 0

  const idsToDelete: string[] = []

  for (const group of groups) {
    const keepId = suggestKeepId(group)
    const loserIds = group.filter(a => a.id !== keepId).map(a => a.id)
    if (!loserIds.length) continue

    const { data: fullRows } = await supabase
      .from('activities')
      .select('id, average_watts, max_watts, raw_data')
      .eq('user_id', userId)
      .in('id', [keepId, ...loserIds])

    const keeper = fullRows?.find(r => r.id === keepId)
    const losers = fullRows?.filter(r => r.id !== keepId) ?? []

    if (keeper) {
      const patch: Record<string, unknown> = {}
      const keeperRaw = (keeper.raw_data as RawData | null) ?? {}
      let rawPatch: RawData | null = null

      if (keeper.average_watts == null) {
        const watts = losers.find(l => l.average_watts != null)?.average_watts
        if (watts != null) patch.average_watts = watts
      }
      if (keeper.max_watts == null) {
        const watts = losers.find(l => l.max_watts != null)?.max_watts
        if (watts != null) patch.max_watts = watts
      }
      if (!keeperRaw.hrZones) {
        const hrZones = losers.map(l => (l.raw_data as RawData | null)?.hrZones).find(Boolean)
        if (hrZones) rawPatch = { ...(rawPatch ?? keeperRaw), hrZones }
      }
      if (!keeperRaw.split) {
        const split = losers.map(l => (l.raw_data as RawData | null)?.split).find(Boolean)
        if (split) rawPatch = { ...(rawPatch ?? keeperRaw), split }
      }
      if (rawPatch) patch.raw_data = rawPatch

      if (Object.keys(patch).length > 0) {
        await supabase.from('activities').update(patch).eq('id', keepId)
      }
    }

    idsToDelete.push(...loserIds)
  }

  if (idsToDelete.length === 0) return 0

  await supabase.from('activities').delete().eq('user_id', userId).in('id', idsToDelete)
  return idsToDelete.length
}
