import type { SupabaseClient } from '@supabase/supabase-js'
import { findDuplicateGroups, suggestKeepId } from '@/lib/duplicates'

// Scans all of a user's activities for fuzzy-matched duplicates (same day,
// sport, distance/time within 5%) and deletes every row in each group
// except the one worth keeping. Runs automatically on every sync so
// duplicates never accumulate, instead of requiring manual review.
export async function autoCleanupDuplicates(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: activities } = await supabase
    .from('activities')
    .select('id, strava_id, start_date, distance, moving_time, sport_type, name, average_heartrate, description, created_at')
    .eq('user_id', userId)

  if (!activities?.length) return 0

  const groups = findDuplicateGroups(activities)
  const idsToDelete = groups.flatMap(group => {
    const keepId = suggestKeepId(group)
    return group.filter(a => a.id !== keepId).map(a => a.id)
  })

  if (idsToDelete.length === 0) return 0

  await supabase.from('activities').delete().eq('user_id', userId).in('id', idsToDelete)
  return idsToDelete.length
}
