// I/O orchestration for the dynamic protein goal — same shape as
// deficit-budget-refreeze.ts, kept as its own small module rather than
// folded into that file since protein has nothing to do with the budget/
// TDEE calculation itself (it only needs weight + the deficit-tracking
// flag). Daniel's "dynamiskt proteinmål" addendum, confirmed as "kör vi på
// det vi har [suggestProteinGoalG's 1.6/2.0 g/kg split] men att den blir
// automatiskt. Och på söndagar då?" — same weekly trigger-schedule
// principle as TDEE, using the same rolling-weight-average source BMR
// already uses (never the raw latest weigh-in) for consistency.
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeRollingWeightAverage } from './deficit'
import { suggestProteinGoalG } from './kost'
import { stockholmDateKey } from './dates'

// Matches the rolling window BMR uses in deficit-budget-refreeze.ts
// (windowDays 7, maxReadings 7, minReadings 1) — the whole point of
// switching from a raw single weigh-in is consistency with how the rest
// of the app already smooths weight, not a second, independently-tuned
// window.
const ROLLING_WINDOW_DAYS = 7
const ROLLING_MAX_READINGS = 7
const ROLLING_MIN_READINGS = 1

export type ProteinGoalRecomputeResult = {
  changed: boolean
  oldGoalG: number | null
  newGoalG: number
  weightUsedKg: number
} | null // null = mode isn't 'auto', or there's no weight data at all to compute from

// Deliberately independent of deficit_tracking_enabled's gating of the
// TDEE cron loop — protein auto-mode applies to ANY user who hasn't
// pinned a manual value, whether or not Viktmål itself is active
// (suggestProteinGoalG's own coefficient already branches on
// deficitTrackingEnabled for the 1.6 vs 2.0 g/kg split).
export async function recomputeProteinGoal(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProteinGoalRecomputeResult> {
  const [{ data: profile }, { data: measurements }] = await Promise.all([
    supabase.from('profiles').select('protein_goal_g, protein_goal_mode, deficit_tracking_enabled, weight_kg').eq('id', userId).single(),
    supabase.from('body_measurements').select('measured_on, weight_kg').eq('user_id', userId).not('weight_kg', 'is', null)
      .order('measured_on', { ascending: false }).limit(30),
  ])
  if (!profile || profile.protein_goal_mode !== 'auto') return null

  const weighIns = (measurements ?? []).map(m => ({ date: m.measured_on as string, weightKg: m.weight_kg as number }))
  const todayKey = stockholmDateKey()
  const rolling = computeRollingWeightAverage(weighIns, todayKey, {
    windowDays: ROLLING_WINDOW_DAYS, maxReadings: ROLLING_MAX_READINGS, minReadings: ROLLING_MIN_READINGS,
  })
  const weightForCalc = rolling.avgKg ?? profile.weight_kg
  if (weightForCalc == null) return null // never computed a number out of thin air

  const newGoalG = suggestProteinGoalG(weightForCalc, profile.deficit_tracking_enabled ?? false)
  const oldGoalG = profile.protein_goal_g ?? null
  const changed = oldGoalG !== newGoalG

  if (changed) {
    await supabase.from('profiles').update({ protein_goal_g: newGoalG }).eq('id', userId)
    const { error } = await supabase.from('deficit_budget_events').insert({
      user_id: userId,
      kind: 'protein_goal_changed',
      old_protein_goal_g: oldGoalG,
      new_protein_goal_g: newGoalG,
      protein_goal_weight_kg: weightForCalc,
    })
    // Same "never silently drop a failed log write" fix as the budget
    // events insert in deficit-budget-refreeze.ts — the protein value
    // itself already updated above regardless, but a swallowed error here
    // would mean the audit trail silently stops matching reality.
    if (error) throw new Error(`deficit_budget_events insert failed (protein_goal_changed): ${error.message}`)
  }

  return { changed, oldGoalG, newGoalG, weightUsedKg: weightForCalc }
}
