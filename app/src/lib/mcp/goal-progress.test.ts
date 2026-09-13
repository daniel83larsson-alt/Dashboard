import { describe, it, expect } from 'vitest'
import { computeGoalProgress } from './goal-progress'
import type { McpMeasurement, McpProfile } from './fetch-user-data'

const TODAY = '2026-09-13'

function profile(overrides: Partial<McpProfile> = {}): McpProfile {
  return {
    deficit_tracking_enabled: true, deficit_start_weight_kg: null, deficit_start_date: null,
    deficit_target_weight_kg: null, deficit_target_date: null, deficit_tdee_kcal: null,
    deficit_budget_kcal: null, daily_calorie_goal: null, protein_goal_g: null,
    kost_tracked_meals: null, daily_step_goal: 10000,
    ...overrides,
  }
}

describe('computeGoalProgress', () => {
  it('matches the spec example exactly: 108 -> 105.5 toward a target of 85 is 11%', () => {
    const p = profile({ deficit_start_weight_kg: 108, deficit_target_weight_kg: 85, deficit_target_date: '2027-07-01' })
    const measurements: McpMeasurement[] = [{ date: TODAY, weightKg: 105.5, waistCm: null }]
    const result = computeGoalProgress(p, measurements, null, TODAY)
    expect(result.percent_to_main_goal).toBe(11)
    expect(result.main_goal).toEqual({ target_kg: 85, target_date: '2027-07-01' })
  })

  it('is on track when the projected date at current pace is before the target date', () => {
    const p = profile({ deficit_start_weight_kg: 120, deficit_target_weight_kg: 90, deficit_target_date: '2027-06-01' })
    const measurements: McpMeasurement[] = [
      { date: '2026-08-31', weightKg: 105.7, waistCm: null },
      { date: '2026-09-06', weightKg: 105.7, waistCm: null },
      { date: '2026-09-07', weightKg: 105.0, waistCm: null },
      { date: '2026-09-13', weightKg: 105.0, waistCm: null },
    ]
    const result = computeGoalProgress(p, measurements, null, TODAY)
    expect(result.on_track).toBe(true)
    expect(result.projected_date_at_current_pace).not.toBeNull()
    expect(result.projected_date_at_current_pace! <= '2027-06-01').toBe(true)
  })

  it('cannot project a date on a plateau (no meaningful loss rate)', () => {
    const p = profile({ deficit_start_weight_kg: 108, deficit_target_weight_kg: 90, deficit_target_date: '2027-06-01' })
    const measurements: McpMeasurement[] = [
      { date: '2026-08-31', weightKg: 105, waistCm: null },
      { date: '2026-09-13', weightKg: 105, waistCm: null },
    ]
    const result = computeGoalProgress(p, measurements, null, TODAY)
    expect(result.projected_date_at_current_pace).toBeNull()
    expect(result.on_track).toBeNull()
  })

  it('is immediately on track once the target weight is already reached', () => {
    const p = profile({ deficit_start_weight_kg: 108, deficit_target_weight_kg: 90, deficit_target_date: '2027-06-01' })
    const measurements: McpMeasurement[] = [{ date: TODAY, weightKg: 89, waistCm: null }]
    const result = computeGoalProgress(p, measurements, null, TODAY)
    expect(result.projected_date_at_current_pace).toBe(TODAY)
    expect(result.on_track).toBe(true)
  })

  it('returns nulls when no main goal is configured', () => {
    const result = computeGoalProgress(profile(), [], null, TODAY)
    expect(result.main_goal).toBeNull()
    expect(result.percent_to_main_goal).toBeNull()
    expect(result.on_track).toBeNull()
    expect(result.projected_date_at_current_pace).toBeNull()
  })

  it('passes through an active milestone as the sub-goal', () => {
    const result = computeGoalProgress(profile(), [], { targetWeightKg: 99, targetDate: '2027-01-01' }, TODAY)
    expect(result.sub_goal).toEqual({ target_kg: 99, target_date: '2027-01-01' })
  })
})
