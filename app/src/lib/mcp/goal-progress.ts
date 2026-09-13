// Pure: builds get_goal_progress()'s JSON payload.
//
// Data-model note (verified before writing this, not assumed): this app
// has no existing "on track toward target_date" boolean or "projected
// date at current pace" calculation anywhere — the `on_track` concept in
// lib/deficit.ts's computeDeficitCheckin is a different thing entirely
// (predicted-vs-actual weight change from a logged calorie deficit over a
// check-in period, not pace-to-goal). Both fields here are newly derived
// from the same rolling-weight-window idea viktmal/page.tsx's 14-day trend
// already uses, comparing a recent 7-day average against the 7 days before
// it to get a kg/day rate, rather than a single noisy two-point slope.
import type { McpMeasurement, McpProfile } from './fetch-user-data'
import type { McpActiveMilestone } from './fetch-milestone'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function avgWeightInRange(weighIns: { date: string; weightKg: number }[], startKey: string, endKeyInclusive: string): number | null {
  const vals = weighIns.filter(w => w.date >= startKey && w.date <= endKeyInclusive).map(w => w.weightKg)
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
}

export type GoalProgress = {
  main_goal: { target_kg: number; target_date: string } | null
  sub_goal: { target_kg: number; target_date: string } | null
  percent_to_main_goal: number | null
  on_track: boolean | null
  projected_date_at_current_pace: string | null
}

const RATE_WINDOW_DAYS = 7
const MIN_MEANINGFUL_LOSS_RATE_KG_PER_DAY = 0.01 // ~70g/week — below this, "current pace" can't project a date

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

  const recentAvg = avgWeightInRange(weighIns, addDays(todayKey, -(RATE_WINDOW_DAYS - 1)), todayKey)
  const priorAvg = avgWeightInRange(weighIns, addDays(todayKey, -(2 * RATE_WINDOW_DAYS - 1)), addDays(todayKey, -RATE_WINDOW_DAYS))
  // Positive = losing weight per day (works for a weight-loss goal; a gain
  // goal would need the sign flipped, but this app only supports loss goals
  // today — see deficit.ts's MAX_SAFE_DEFICIT_KCAL framing).
  const lossRatePerDay = recentAvg != null && priorAvg != null ? (priorAvg - recentAvg) / RATE_WINDOW_DAYS : null

  let projectedDate: string | null = null
  if (mainGoal != null && currentWeightKg != null) {
    const remainingKg = currentWeightKg - mainGoal.target_kg
    if (remainingKg <= 0) {
      projectedDate = todayKey
    } else if (lossRatePerDay != null && lossRatePerDay >= MIN_MEANINGFUL_LOSS_RATE_KG_PER_DAY) {
      projectedDate = addDays(todayKey, Math.ceil(remainingKg / lossRatePerDay))
    }
  }
  const onTrack = projectedDate != null && mainGoal != null ? projectedDate <= mainGoal.target_date : null

  return {
    main_goal: mainGoal,
    sub_goal: subGoal,
    percent_to_main_goal: percentToMainGoal,
    on_track: onTrack,
    projected_date_at_current_pace: projectedDate,
  }
}
