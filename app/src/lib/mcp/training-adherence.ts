// Pure: builds get_training_adherence(weeks)'s JSON payload from already-
// fetched activities + an optional structured strength goal.
import { isStrengthSport } from '@/lib/sport'
import type { McpActivity, McpStrengthGoal } from './fetch-training-data'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`).getTime()
  const end = new Date(`${endISO}T00:00:00`).getTime()
  return Math.round((end - start) / 86400000)
}

export type TrainingAdherence = {
  period_weeks: number
  strength_sessions_logged: number
  strength_sessions_target_per_week: number | null
  rowing_sessions_logged: number
  last_strength_session: string | null
  days_since_last_strength_session: number | null
}

// activities: expected to cover a lookback wider than `weeks` (the caller
// fetches ~1 year back) so "last strength session"/"days since" stay
// accurate even when the last one predates the adherence window itself.
export function computeTrainingAdherence(
  activities: McpActivity[],
  strengthGoal: McpStrengthGoal | null,
  weeks: number,
  todayKey: string,
): TrainingAdherence {
  const windowStartKey = addDays(todayKey, -weeks * 7)
  const inWindow = activities.filter(a => a.start_date.slice(0, 10) >= windowStartKey)

  const strengthAll = activities.filter(a => isStrengthSport(a.sport_type))
  const lastStrength = strengthAll.length ? strengthAll[strengthAll.length - 1].start_date.slice(0, 10) : null

  return {
    period_weeks: weeks,
    strength_sessions_logged: inWindow.filter(a => isStrengthSport(a.sport_type)).length,
    strength_sessions_target_per_week: strengthGoal?.sessionsPerWeek ?? null,
    rowing_sessions_logged: inWindow.filter(a => a.sport_type === 'Rowing').length,
    last_strength_session: lastStrength,
    days_since_last_strength_session: lastStrength ? daysBetween(lastStrength, todayKey) : null,
  }
}
