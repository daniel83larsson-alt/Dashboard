// I/O layer for get_weekly_summary's kcal_diff_avg_7d — reconstructing
// which TDEE was actually in force on each day of the window (see
// lib/deficit.ts's tdeeInForceOn) instead of assuming today's current TDEE
// applied retroactively for the whole week.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BudgetEvent } from '@/lib/deficit'

export async function fetchMcpBudgetEvents(supabase: SupabaseClient, userId: string): Promise<BudgetEvent[]> {
  const { data } = await supabase
    .from('deficit_budget_events')
    .select('created_at, new_budget_kcal, new_tdee_kcal')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return (data ?? []).map(r => ({
    createdAt: r.created_at as string,
    newBudgetKcal: r.new_budget_kcal as number | null,
    newTdeeKcal: r.new_tdee_kcal as number | null,
  }))
}
