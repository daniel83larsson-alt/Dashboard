// I/O layer for get_goal_progress's sub-goal (delmål) — same query
// viktmal/page.tsx already runs against deficit_milestones.
import type { SupabaseClient } from '@supabase/supabase-js'

export type McpActiveMilestone = { targetWeightKg: number; targetDate: string }

export async function fetchMcpActiveMilestone(supabase: SupabaseClient, userId: string): Promise<McpActiveMilestone | null> {
  const { data } = await supabase
    .from('deficit_milestones')
    .select('target_weight_kg, target_date')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return data ? { targetWeightKg: data.target_weight_kg as number, targetDate: data.target_date as string } : null
}
