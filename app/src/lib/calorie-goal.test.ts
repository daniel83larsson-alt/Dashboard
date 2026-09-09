import { describe, it, expect } from 'vitest'
import { resolveEffectiveCalorieGoal } from './calorie-goal'

describe('resolveEffectiveCalorieGoal', () => {
  it('prefers the Viktmål budget when deficit tracking is on and set', () => {
    expect(resolveEffectiveCalorieGoal({ dailyCalorieGoal: 2350, deficitTrackingEnabled: true, deficitBudgetKcal: 2151 }))
      .toEqual({ kcal: 2151, source: 'deficit_budget' })
  })

  it('falls back to the manual goal when deficit tracking is off', () => {
    expect(resolveEffectiveCalorieGoal({ dailyCalorieGoal: 2350, deficitTrackingEnabled: false, deficitBudgetKcal: 2151 }))
      .toEqual({ kcal: 2350, source: 'manual' })
  })

  it('falls back to the manual goal when deficit tracking is on but has no budget yet', () => {
    expect(resolveEffectiveCalorieGoal({ dailyCalorieGoal: 2350, deficitTrackingEnabled: true, deficitBudgetKcal: null }))
      .toEqual({ kcal: 2350, source: 'manual' })
  })

  it('returns null when neither is set', () => {
    expect(resolveEffectiveCalorieGoal({ dailyCalorieGoal: null, deficitTrackingEnabled: false, deficitBudgetKcal: null }))
      .toEqual({ kcal: null, source: null })
  })
})
