import { describe, it, expect } from 'vitest'
import { detectDayAnomalies, dayFlagLabel } from './day-anomaly'
import type { KostFoodEntry } from './kost'

function entry(overrides: Partial<KostFoodEntry> = {}): KostFoodEntry {
  return {
    id: crypto.randomUUID(), name: 'Test', calories: 300, protein_g: 5, carb_g: 40, fat_g: 10,
    meal: 'lunch', source: 'ai_text', logged_at: '2026-08-30T12:00:00Z',
    ...overrides,
  }
}

describe('detectDayAnomalies', () => {
  it('never flags an incomplete day, regardless of the numbers', () => {
    const flags = detectDayAnomalies({
      day: { eatenKcal: 300, proteinG: 5, entries: [], isComplete: false, source: 'manual' },
      baselineAvgKcal: 2000, baselineDaysLogged: 20, proteinGoalG: 180, budgetKcal: 2300,
    })
    expect(flags).toEqual([])
  })

  it('flags low protein despite multiple logged protein sources (Daniel\'s casein case)', () => {
    const entries = [
      entry({ name: 'Kaseinpulver', calories: 110, protein_g: 25 }), // 22.7g/100kcal — a real source
      entry({ name: 'Kaseinpulver', calories: 110, protein_g: 25 }),
      entry({ name: 'Pasta med grädde', calories: 1400, protein_g: 15 }), // carb/fat-led, not a source
    ]
    // Total kcal (1620) is close enough to baseline that the low-kcal rule
    // stays quiet — this day's problem is protein composition, not volume.
    const flags = detectDayAnomalies({
      day: { eatenKcal: 1620, proteinG: 65, entries, isComplete: true, source: 'manual' },
      baselineAvgKcal: 2000, baselineDaysLogged: 20, proteinGoalG: 180, budgetKcal: 2300,
    })
    expect(flags).toEqual([{ kind: 'low_protein_despite_sources', proteinG: 65, goalG: 180, proteinSourceCount: 2 }])
  })

  it('does not flag low protein when there are fewer than 2 real protein sources', () => {
    const entries = [entry({ name: 'Kaseinpulver', calories: 110, protein_g: 25 })]
    const flags = detectDayAnomalies({
      day: { eatenKcal: 1020, proteinG: 65, entries, isComplete: true, source: 'manual' },
      baselineAvgKcal: 2000, baselineDaysLogged: 20, proteinGoalG: 180, budgetKcal: 2300,
    })
    expect(flags.some(f => f.kind === 'low_protein_despite_sources')).toBe(false)
  })

  it('does not flag protein without a set proteinGoalG', () => {
    const entries = [entry({ calories: 110, protein_g: 25 }), entry({ calories: 110, protein_g: 25 })]
    const flags = detectDayAnomalies({
      day: { eatenKcal: 220, proteinG: 50, entries, isComplete: true, source: 'manual' },
      baselineAvgKcal: null, baselineDaysLogged: 0, proteinGoalG: null, budgetKcal: 2300,
    })
    expect(flags).toEqual([])
  })

  it('flags an unusually low-calorie day relative to baseline and budget', () => {
    const flags = detectDayAnomalies({
      day: { eatenKcal: 900, proteinG: 80, entries: [], isComplete: true, source: 'yazio' },
      baselineAvgKcal: 2200, baselineDaysLogged: 20, proteinGoalG: 150, budgetKcal: 2300,
    })
    expect(flags).toEqual([{ kind: 'kcal_far_below_baseline', eatenKcal: 900, baselineKcal: 2200, pctBelow: 59 }])
  })

  it('does not flag a low day without enough baseline history yet', () => {
    const flags = detectDayAnomalies({
      day: { eatenKcal: 900, proteinG: 80, entries: [], isComplete: true, source: 'yazio' },
      baselineAvgKcal: 2200, baselineDaysLogged: 5, proteinGoalG: 150, budgetKcal: 2300,
    })
    expect(flags).toEqual([])
  })

  it('does not flag a deliberately-disciplined low day that is still close to budget', () => {
    // Below 70% of baseline, but not meaningfully below the budget itself.
    const flags = detectDayAnomalies({
      day: { eatenKcal: 1500, proteinG: 120, entries: [], isComplete: true, source: 'yazio' },
      baselineAvgKcal: 2200, baselineDaysLogged: 20, proteinGoalG: 150, budgetKcal: 1600,
    })
    expect(flags.some(f => f.kind === 'kcal_far_below_baseline')).toBe(false)
  })

  it('flags a high-calorie, low-protein-density day', () => {
    const flags = detectDayAnomalies({
      day: { eatenKcal: 2500, proteinG: 60, entries: [], isComplete: true, source: 'yazio' },
      baselineAvgKcal: 2200, baselineDaysLogged: 20, proteinGoalG: 150, budgetKcal: 2300,
    })
    expect(flags).toEqual([{ kind: 'high_kcal_low_protein', eatenKcal: 2500, proteinG: 60 }])
  })

  it('produces a one-line label per flag kind', () => {
    expect(dayFlagLabel({ kind: 'low_protein_despite_sources', proteinG: 65, goalG: 180, proteinSourceCount: 2 })).toContain('Lågt protein')
    expect(dayFlagLabel({ kind: 'kcal_far_below_baseline', eatenKcal: 900, baselineKcal: 2200, pctBelow: 59 })).toContain('lågt kaloriintag')
    expect(dayFlagLabel({ kind: 'high_kcal_low_protein', eatenKcal: 2500, proteinG: 60 })).toContain('protein')
  })
})
