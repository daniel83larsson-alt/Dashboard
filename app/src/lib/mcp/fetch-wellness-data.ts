// I/O layer for get_recovery_data / get_rowing_trends' resting_hr_avg —
// reads the same coach_sessions('garmin_wellness') row garmin-sync.ts
// writes to and weekly-digest-generate.ts already reads for its own
// wellness stats, in the same {history: DayWellness[], updatedAt} shape.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DayWellness } from '@/lib/garmin-sync'

export async function fetchMcpWellnessHistory(supabase: SupabaseClient, userId: string): Promise<DayWellness[]> {
  const { data: row } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'garmin_wellness')
    .single()
  const raw = (row?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { history?: DayWellness[] }
    return Array.isArray(parsed.history) ? parsed.history : []
  } catch {
    return []
  }
}
