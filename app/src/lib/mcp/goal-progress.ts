// Pure: builds get_goal_progress()'s JSON payload.
//
// The pace/projection math itself (`on_track`, `projected_date_at_current_
// pace`) now lives in lib/deficit.ts's computeWeightTrendProjection —
// originally written here first, then extracted once the Viktmål page
// needed the exact same "current measured pace vs target" logic for its own
// "med denna hastighet..." line. Sharing it means this tool and the app UI
// can never quietly disagree about the same pace.
import type { McpMeasurement, McpProfile } from './fetch-user-data'
import type { McpActiveMilestone } from './fetch-milestone'
import { computeWeightTrendProjection } from '../deficit'

export type GoalProgress = {
  main_goal: { target_kg: number; target_date: string } | null
  sub_goal: { target_kg: number; target_date: string } | null
  percent_to_main_goal: number | null
  on_track: boolean | null
  projected_date_at_current_pace: string | null
}

export function computeGoalProgress(
  profile: McpProfile | null,
  measurements: McpMeasurement[],
  activeMilestone: McpActiveMilestone | null,
  todayKey: string,
): GoalProgress {
  const weighIns = measurements
    .filter((m): m is typeof m & { weightKg: number } => m.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const currentWeightKg = weighIns.length ? weighIns[weighIns.length - 1].weightKg : (profile?.deficit_start_weight_kg ?? null)

  const startWeightKg = profile?.deficit_start_weight_kg ?? null
  const targetWeightKg = profile?.deficit_target_weight_kg ?? null
  const targetDate = profile?.deficit_target_date ?? null
  const mainGoal = targetWeightKg != null && targetDate != null ? { target_kg: targetWeightKg, target_date: targetDate } : null
  const subGoal = activeMilestone ? { target_kg: activeMilestone.targetWeightKg, target_date: activeMilestone.targetDate } : null

  const percentToMainGoal = startWeightKg != null && targetWeightKg != null && currentWeightKg != null && startWeightKg !== targetWeightKg
    ? Math.min(100, Math.max(0, Math.round(((startWeightKg - currentWeightKg) / (startWeightKg - targetWeightKg)) * 100)))
    : null

  // Only projects when a FULL main goal (weight + date) is configured —
  // matches the old inline behavior here exactly, so a target weight saved
  // without a date still reports no projection rather than a dateless one.
  const trend = computeWeightTrendProjection(weighIns, currentWeightKg, mainGoal?.target_kg ?? null, mainGoal?.target_date ?? null, todayKey)

  return {
    main_goal: mainGoal,
    sub_goal: subGoal,
    percent_to_main_goal: percentToMainGoal,
    on_track: trend.onTrack,
    projected_date_at_current_pace: trend.projectedDateISO,
  }
}
