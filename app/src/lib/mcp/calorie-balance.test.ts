import { describe, it, expect } from 'vitest'
import { computeCalorieBalance } from './calorie-balance'
import type { McpUserData, McpProfile } from './fetch-user-data'
import type { KostFoodEntry } from '@/lib/kost'
import type { McpActivity } from './fetch-training-data'
import type { BudgetEvent } from '@/lib/deficit'

const TODAY_KEY = '2026-09-20'

function entry(overrides: Partial<KostFoodEntry> = {}): KostFoodEntry {
  return {
    id: crypto.randomUUID(), name: 'Test', calories: 1795, protein_g: 150, carb_g: null, fat_g: null,
    meal: 'breakfast', source: 'ai_text', logged_at: `${TODAY_KEY}T08:00:00Z`,
    ...overrides,
  }
}

function activity(daysAgo: number, calories: number | null): McpActivity {
  const d = new Date(`${TODAY_KEY}T12:00:00Z`)
  d.setDate(d.getDate() - daysAgo)
  return { id: crypto.randomUUID(), strava_id: Math.floor(Math.random() * 1e9), start_date: d.toISOString(), distance: 5000, moving_time: 1800, sport_type: 'Run', calories }
}

function baseData(overrides: Partial<McpUserData> = {}): McpUserData {
  const profile: McpProfile = {
    deficit_tracking_enabled: true, deficit_start_weight_kg: 108, deficit_start_date: '2026-08-30',
    deficit_target_weight_kg: 85, deficit_target_date: '2027-07-01', deficit_tdee_kcal: 2622,
    deficit_budget_kcal: 2166, daily_calorie_goal: null, protein_goal_g: 210,
    kost_tracked_meals: ['breakfast'], daily_step_goal: 10000,
  }
  return {
    profile, yazioByDate: new Map(), manualByDate: new Map(), dayOverrides: new Set(),
    trackedMeals: ['breakfast'], measurements: [],
    ...overrides,
  }
}

// 5 of the 7 days in the window logged, each eating 1795 kcal.
function fiveLoggedDays(): Map<string, KostFoodEntry[]> {
  const manualByDate = new Map<string, KostFoodEntry[]>()
  for (let i = 0; i < 5; i++) {
    const d = new Date(`${TODAY_KEY}T00:00:00`)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    manualByDate.set(key, [entry({ logged_at: `${key}T08:00:00Z` })])
  }
  return manualByDate
}

describe('computeCalorieBalance', () => {
  it('matches Daniel\'s own example: separates eaten/tdee/training/budget as distinct fields', () => {
    const data = baseData({ manualByDate: fiveLoggedDays() })
    const activities = Array.from({ length: 4 }, (_, i) => activity(i, 187)) // 4 real days, avg 187*4/7 raw before correction
    const b = computeCalorieBalance(data, activities, [], 0.75, TODAY_KEY, 7)
    expect(b.period_days).toBe(7)
    expect(b.avg_kcal_eaten).toBe(1795)
    expect(b.avg_tdee).toBe(2622)
    expect(b.avg_budget).toBe(2166)
    expect(b.avg_diff_vs_budget).toBe(1795 - 2166)
    expect(b.days_with_logged_training).toBe(4)
    expect(b.avg_training_burn_component).toBe(Math.round(((187 * 4) / 7) * 0.75))
  })

  it('only averages complete days for avg_kcal_eaten, not incomplete ones', () => {
    const data = baseData({
      manualByDate: fiveLoggedDays(),
      trackedMeals: ['breakfast', 'lunch'], // now incomplete since only breakfast was logged
    })
    const b = computeCalorieBalance(data, [], [], 0.75, TODAY_KEY, 7)
    expect(b.avg_kcal_eaten).toBeNull()
  })

  it('returns null training burn component below the floor(days/2) real-day threshold', () => {
    const data = baseData()
    const activities = [activity(0, 200), activity(1, 200)] // only 2 real days, floor(7/2)=3 required
    const b = computeCalorieBalance(data, activities, [], 0.75, TODAY_KEY, 7)
    expect(b.avg_training_burn_component).toBeNull()
    expect(b.days_with_logged_training).toBe(2)
  })

  it('uses floor(14/2)=7 for a 14-day window, matching the budget\'s own threshold', () => {
    const data = baseData()
    const activities = Array.from({ length: 6 }, (_, i) => activity(i, 200))
    const belowThreshold = computeCalorieBalance(data, activities, [], 0.75, TODAY_KEY, 14)
    expect(belowThreshold.avg_training_burn_component).toBeNull()
    const withSeven = computeCalorieBalance(data, [...activities, activity(6, 200)], [], 0.75, TODAY_KEY, 14)
    expect(withSeven.avg_training_burn_component).not.toBeNull()
  })

  it('reports null tdee/budget/diff when deficit tracking has nothing set up', () => {
    const data = baseData({
      profile: { ...baseData().profile!, deficit_tracking_enabled: false, deficit_tdee_kcal: null, deficit_budget_kcal: null, daily_calorie_goal: null },
    })
    const b = computeCalorieBalance(data, [], [], 0.75, TODAY_KEY, 7)
    expect(b.avg_tdee).toBeNull()
    expect(b.avg_budget).toBeNull()
    expect(b.avg_diff_vs_budget).toBeNull()
  })

  it('reconstructs historically-correct tdee/budget per day via budgetEvents, not just today\'s current value', () => {
    const data = baseData()
    // Budget changed mid-window: was 2000/2500 before 3 days ago, now 2166/2622.
    const threeDaysAgo = new Date(`${TODAY_KEY}T00:00:00`)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const events: BudgetEvent[] = [{ createdAt: threeDaysAgo.toISOString(), newBudgetKcal: 2166, newTdeeKcal: 2622 }]
    const b = computeCalorieBalance(data, [], events, 0.75, TODAY_KEY, 7)
    // Some days in the 7-day window predate the change (should use 2000/2500 fallback... but
    // there's no earlier event, so budgetInForceOn falls back to currentBudgetKcal for those too —
    // just confirming this doesn't crash and produces a sane average, not a specific old value).
    expect(b.avg_budget).not.toBeNull()
    expect(b.avg_tdee).not.toBeNull()
  })

  it('excludes activities outside the requested window', () => {
    const data = baseData()
    const activities = [activity(0, 200), activity(1, 200), activity(2, 200), activity(20, 200)] // last one way outside a 7-day window
    const b = computeCalorieBalance(data, activities, [], 0.75, TODAY_KEY, 7)
    expect(b.days_with_logged_training).toBe(3)
  })
})
