// I/O layer for get_budget_history — a wider row shape than
// fetch-budget-events.ts's own McpBudgetEvent (which only carries the two
// fields budgetInForceOn/tdeeInForceOn need for day reconstruction). This
// needs the full "what changed and why" columns, same set ViktmalClient's
// own Budgethistorik card already selects. Unbounded fetch (no date
// filter) — same "fetch wide, slice per tool" principle fetch-user-data.ts
// uses; the pure compute layer windows it by `days`, since it also needs
// the event just BEFORE the window to explain the first visible change.
import type { SupabaseClient } from '@supabase/supabase-js'

export type McpBudgetHistoryRow = {
  kind: string
  createdAt: string
  oldBudgetKcal: number | null
  newBudgetKcal: number | null
  newTdeeKcal: number | null
  bmrKcal: number | null
  trainingKcal: number | null
  neatFactor: number | null
  garminCorrection: number | null
}

// protein_goal_changed events share this table (see lib/protein-goal-refreeze.ts)
// but carry none of these budget/TDEE columns — excluded here since this
// tool is specifically about budget/TDEE history, not protein.
export async function fetchMcpBudgetHistory(supabase: SupabaseClient, userId: string): Promise<McpBudgetHistoryRow[]> {
  const { data } = await supabase
    .from('deficit_budget_events')
    .select('kind, created_at, old_budget_kcal, new_budget_kcal, new_tdee_kcal, bmr_kcal, training_kcal, neat_factor, garmin_correction')
    .eq('user_id', userId)
    .neq('kind', 'protein_goal_changed')
    .order('created_at', { ascending: true })
  return (data ?? []).map(r => ({
    kind: r.kind as string,
    createdAt: r.created_at as string,
    oldBudgetKcal: r.old_budget_kcal as number | null,
    newBudgetKcal: r.new_budget_kcal as number | null,
    newTdeeKcal: r.new_tdee_kcal as number | null,
    bmrKcal: r.bmr_kcal as number | null,
    trainingKcal: r.training_kcal as number | null,
    neatFactor: r.neat_factor as number | null,
    garminCorrection: r.garmin_correction as number | null,
  }))
}
