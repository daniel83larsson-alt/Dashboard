import { describe, it, expect } from 'vitest'
import { computeWeeklySummary } from './weekly-summary'
import type { McpUserData, McpProfile } from './fetch-user-data'
import type { KostFoodEntry } from '@/lib/kost'

const TODAY_KEY = '2026-09-13'

function entry(overrides: Partial<KostFoodEntry> = {}): KostFoodEntry {
  return {
    id: crypto.randomUUID(), name: 'Test', calories: 2200, protein_g: 160, carb_g: null, fat_g: null,
    meal: 'breakfast', source: 'ai_text', logged_at: `${TODAY_KEY}T08:00:00Z`,
    ...overrides,
  }
}

function baseData(overrides: Partial<McpUserData> = {}): McpUserData {
  const profile: McpProfile = {
    deficit_tracking_enabled: true,
    deficit_start_weight_kg: 108,
    deficit_start_date: '2026-08-30',
    deficit_target_weight_kg: 85,
    deficit_target_date: '2027-07-01',
    deficit_tdee_kcal: 2680,
    deficit_budget_kcal: 2160,
    daily_calorie_goal: null,
    protein_goal_g: 185,
    kost_tracked_meals: ['breakfast'],
  }
  return {
    profile,
    yazioByDate: new Map(),
    manualByDate: new Map(),
    dayOverrides: new Set(),
    trackedMeals: ['breakfast'],
    measurements: [],
    ...overrides,
  }
}

// 6 of the 7 days in the rolling window (2026-09-07..2026-09-13) logged,
// eating 2200 kcal/2211 avg-ish — mirrors the real example in the spec
// Daniel pasted (kcal_diff_avg_7d: -469 against a -520 target).
function sixLoggedDays(): Map<string, KostFoodEntry[]> {
  const manualByDate = new Map<string, KostFoodEntry[]>()
  const dates = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']
  for (const date of dates) {
    manualByDate.set(date, [entry({ logged_at: `${date}T08:00:00Z`, calories: 2211, protein_g: 168 })])
  }
  return manualByDate
}

describe('computeWeeklySummary', () => {
  it('converts eaten-vs-budget to eaten-vs-TDEE and reports the target the same way', () => {
    const data = baseData({ manualByDate: sixLoggedDays() })
    const s = computeWeeklySummary(data, TODAY_KEY)
    expect(s.days_logged).toBe(6)
    expect(s.days_total).toBe(7)
    expect(s.tdee_kcal).toBe(2680)
    expect(s.budget_kcal).toBe(2160)
    expect(s.kcal_diff_target).toBe(2160 - 2680) // -520
    // avg eaten 2211 -> vs TDEE: 2211 - 2680 = -469
    expect(s.kcal_diff_avg_7d).toBe(2211 - 2680)
    expect(s.protein_avg_7d_g).toBe(168)
  })

  it('prefers the Viktmål budget over the manual calorie goal (resolveEffectiveCalorieGoal)', () => {
    const data = baseData({
      profile: {
        ...baseData().profile!,
        daily_calorie_goal: 2350,
        deficit_budget_kcal: 2160,
      },
    })
    const s = computeWeeklySummary(data, TODAY_KEY)
    expect(s.budget_kcal).toBe(2160)
  })

  it('reports null kcal fields when deficit tracking has no budget/TDEE yet', () => {
    const data = baseData({
      profile: { ...baseData().profile!, deficit_tracking_enabled: false, deficit_budget_kcal: null, deficit_tdee_kcal: null, daily_calorie_goal: null },
    })
    const s = computeWeeklySummary(data, TODAY_KEY)
    expect(s.budget_kcal).toBeNull()
    expect(s.tdee_kcal).toBeNull()
    expect(s.kcal_diff_target).toBeNull()
    expect(s.kcal_diff_avg_7d).toBeNull()
  })

  it('reports null protein average when no day in the window has protein data', () => {
    const manualByDate = new Map([[TODAY_KEY, [entry({ protein_g: null })]]])
    const data = baseData({ manualByDate })
    const s = computeWeeklySummary(data, TODAY_KEY)
    expect(s.protein_avg_7d_g).toBeNull()
  })

  it('falls back to the goal start weight when there are no weigh-ins yet', () => {
    const data = baseData()
    const s = computeWeeklySummary(data, TODAY_KEY)
    expect(s.weight_current_kg).toBe(108)
    expect(s.weight_avg_of_last_n).toEqual({ n: 0, avg_kg: null })
  })

  it('computes current weight, rolling average, and waist-since-start from real measurements', () => {
    const data = baseData({
      measurements: [
        { date: '2026-08-30', weightKg: 108, waistCm: 110 },
        { date: '2026-09-09', weightKg: 106.2, waistCm: 106 },
        { date: '2026-09-10', weightKg: 105.5, waistCm: 104 },
      ],
    })
    const s = computeWeeklySummary(data, TODAY_KEY)
    expect(s.weight_current_kg).toBe(105.5)
    expect(s.waist_last_cm).toBe(104)
    expect(s.waist_change_since_start_cm).toBe(104 - 110)
    expect(s.weight_avg_of_last_n.n).toBeGreaterThan(0)
  })

  it('does not compute a waist change from a single measurement', () => {
    const data = baseData({ measurements: [{ date: '2026-09-10', weightKg: 105.5, waistCm: 104 }] })
    const s = computeWeeklySummary(data, TODAY_KEY)
    expect(s.waist_change_since_start_cm).toBeNull()
    expect(s.waist_last_cm).toBe(104)
  })

  it('period spans exactly the 7 days ending today', () => {
    const s = computeWeeklySummary(baseData(), TODAY_KEY)
    expect(s.period).toBe('2026-09-07 till 2026-09-13')
  })
})
