import { describe, it, expect } from 'vitest'
import { computeProteinTrend } from './protein-trend'
import type { McpUserData, McpProfile } from './fetch-user-data'
import type { KostFoodEntry } from '@/lib/kost'

const TODAY_KEY = '2026-09-13'

function entry(overrides: Partial<KostFoodEntry> = {}): KostFoodEntry {
  return {
    id: crypto.randomUUID(), name: 'Test', calories: 2000, protein_g: 150, carb_g: null, fat_g: null,
    meal: 'breakfast', source: 'ai_text', logged_at: `${TODAY_KEY}T08:00:00Z`,
    ...overrides,
  }
}

function baseData(overrides: Partial<McpUserData> = {}): McpUserData {
  const profile: McpProfile = {
    deficit_tracking_enabled: true, deficit_start_weight_kg: 108, deficit_start_date: '2026-08-30',
    deficit_target_weight_kg: 85, deficit_target_date: '2027-07-01', deficit_tdee_kcal: 2680,
    deficit_budget_kcal: 2160, daily_calorie_goal: null, protein_goal_g: 185, kost_tracked_meals: ['breakfast'],
    daily_step_goal: 10000,
  }
  return {
    profile, yazioByDate: new Map(), manualByDate: new Map(), dayOverrides: new Set(),
    trackedMeals: ['breakfast'], measurements: [],
    ...overrides,
  }
}

describe('computeProteinTrend', () => {
  it('matches the example in the spec: mixed days above/below target with distinct lowest/highest', () => {
    const proteinByDate: Record<string, number> = {
      '2026-09-07': 180, '2026-09-08': 112, '2026-09-09': 175,
      '2026-09-10': 160, '2026-09-11': 190, '2026-09-12': 190, '2026-09-13': 210,
    }
    const manualByDate = new Map(
      Object.entries(proteinByDate).map(([date, g]) => [date, [entry({ logged_at: `${date}T08:00:00Z`, protein_g: g })]])
    )
    const data = baseData({ manualByDate })
    const t = computeProteinTrend(data, TODAY_KEY, 7)
    expect(t.period_days).toBe(7)
    expect(t.protein_target_g_per_day).toBe(185)
    const avg = Math.round(Object.values(proteinByDate).reduce((s, g) => s + g, 0) / 7)
    expect(t.protein_avg_g_per_day).toBe(avg)
    expect(t.lowest_day).toEqual({ date: '2026-09-08', protein_g: 112 })
    expect(t.highest_day).toEqual({ date: '2026-09-13', protein_g: 210 })
    // 180,175,190,190,210 >= 185 -> 5 at/above (per the >= 185 rule: 180 is below, recompute)
    const atOrAbove = Object.values(proteinByDate).filter(g => g >= 185).length
    expect(t.days_at_or_above_target).toBe(atOrAbove)
    expect(t.days_below_target).toBe(7 - atOrAbove)
  })

  it('returns nulls for a window with no protein data at all', () => {
    const t = computeProteinTrend(baseData(), TODAY_KEY, 7)
    expect(t.protein_avg_g_per_day).toBeNull()
    expect(t.lowest_day).toBeNull()
    expect(t.highest_day).toBeNull()
    expect(t.days_at_or_above_target).toBe(0)
    expect(t.days_below_target).toBe(0)
  })

  it('returns null target-count fields (not 0) when no protein goal is set', () => {
    const manualByDate = new Map([[TODAY_KEY, [entry({ protein_g: 150 })]]])
    const data = baseData({ manualByDate, profile: { ...baseData().profile!, protein_goal_g: null } })
    const t = computeProteinTrend(data, TODAY_KEY, 7)
    expect(t.protein_target_g_per_day).toBeNull()
    expect(t.days_at_or_above_target).toBeNull()
    expect(t.days_below_target).toBeNull()
    expect(t.protein_avg_g_per_day).toBe(150)
  })

  it('respects a custom window size', () => {
    const manualByDate = new Map([[TODAY_KEY, [entry({ protein_g: 150 })]]])
    const data = baseData({ manualByDate })
    const t = computeProteinTrend(data, TODAY_KEY, 1)
    expect(t.period_days).toBe(1)
    expect(t.protein_avg_g_per_day).toBe(150)
  })

  it('breaks a tie on lowest/highest by the earlier date', () => {
    const manualByDate = new Map([
      ['2026-09-12', [entry({ logged_at: '2026-09-12T08:00:00Z', protein_g: 150 })]],
      ['2026-09-13', [entry({ logged_at: '2026-09-13T08:00:00Z', protein_g: 150 })]],
    ])
    const data = baseData({ manualByDate })
    const t = computeProteinTrend(data, TODAY_KEY, 7)
    expect(t.lowest_day?.date).toBe('2026-09-12')
    expect(t.highest_day?.date).toBe('2026-09-12')
  })
})
