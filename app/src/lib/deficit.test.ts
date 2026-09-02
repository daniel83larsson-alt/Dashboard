import { describe, it, expect } from 'vitest'
import { computeDeficitBudget, dailyDiffStatus, compute7DayAverage, computeDeficitCheckin, selectCheckinPeriod } from './deficit'

describe('computeDeficitBudget', () => {
  // Daniel's own hand-calculated example from the spec: 105 kg -> 90 kg by
  // 2027-06-15, BMR 1960 (105kg/180cm/44 år/man), ~400 kcal/day raw training.
  const NOW = new Date('2026-08-30T00:00:00Z')
  // 2027-06-15 is exactly 289 days after 2026-08-30 — close enough to the
  // spec's own "~44 weeks" (308 days) approximation to sanity-check against,
  // but we use the exact figure here so the math is checkable by hand.

  it('matches the spec-author\'s own hand-calculated example within rounding', () => {
    const result = computeDeficitBudget({
      bmr: 1960,
      goal: { startWeightKg: 105, targetWeightKg: 90, targetDateISO: '2027-06-30', neatFactor: 1.25, garminCorrection: 0.75 },
      avgTrainingKcalRaw: 400,
      activityFallbackKcal: 300,
      now: NOW,
    })
    // NEAT = 1960*1.25 = 2450, training = 400*0.75 = 300 -> TDEE 2750
    expect(result.tdeeKcal).toBe(2750)
    // 15kg * 7700 / daysLeft(2026-08-30..2027-06-30 = 304) ≈ 380
    expect(result.dailyDeficitKcal).toBeGreaterThan(350)
    expect(result.dailyDeficitKcal).toBeLessThan(400)
    expect(result.budgetKcal).toBe(result.tdeeKcal - result.dailyDeficitKcal)
    expect(result.capped).toBe(false)
  })

  it('falls back to the user-chosen activity estimate when there is no real training history yet', () => {
    const result = computeDeficitBudget({
      bmr: 1960,
      goal: { startWeightKg: 105, targetWeightKg: 90, targetDateISO: '2027-06-30', neatFactor: 1.25, garminCorrection: 0.75 },
      avgTrainingKcalRaw: null,
      activityFallbackKcal: 300,
      now: NOW,
    })
    // training = 300*0.75 = 225 -> TDEE = 2450+225 = 2675
    expect(result.tdeeKcal).toBe(2675)
  })

  it('caps an unsafely aggressive deficit at a floor and suggests a realistic date instead', () => {
    const result = computeDeficitBudget({
      bmr: 1960,
      // 20 kg in 30 days is not remotely safe.
      goal: { startWeightKg: 105, targetWeightKg: 85, targetDateISO: '2026-09-29', neatFactor: 1.25, garminCorrection: 0.75 },
      avgTrainingKcalRaw: 400,
      activityFallbackKcal: 300,
      now: NOW,
    })
    expect(result.capped).toBe(true)
    expect(result.budgetKcal).toBeGreaterThanOrEqual(1400)
    expect(result.suggestedTargetDateISO).not.toBeNull()
    // A realistic date for that much weight loss is necessarily far later
    // than the unsafe one requested.
    expect(result.suggestedTargetDateISO! > '2026-09-29').toBe(true)
  })

  it('never lets the daily deficit go negative even if the target is heavier than the start (a "gain" goal isn\'t a negative deficit)', () => {
    const result = computeDeficitBudget({
      bmr: 1960,
      goal: { startWeightKg: 80, targetWeightKg: 85, targetDateISO: '2027-01-01', neatFactor: 1.25, garminCorrection: 0.75 },
      avgTrainingKcalRaw: 300,
      activityFallbackKcal: 300,
      now: NOW,
    })
    expect(result.dailyDeficitKcal).toBe(0)
    expect(result.capped).toBe(false)
  })
})

describe('dailyDiffStatus', () => {
  it('is grey for an incomplete day regardless of the numbers', () => {
    expect(dailyDiffStatus(5000, 2000, false)).toBe('grey')
  })
  it('is green at or under budget', () => {
    expect(dailyDiffStatus(2000, 2375, true)).toBe('green')
    expect(dailyDiffStatus(2375, 2375, true)).toBe('green')
  })
  it('is yellow for a small overshoot', () => {
    expect(dailyDiffStatus(2500, 2375, true)).toBe('yellow')
  })
  it('is red for a large overshoot', () => {
    expect(dailyDiffStatus(2800, 2375, true)).toBe('red')
  })
})

describe('compute7DayAverage', () => {
  it('hides the average entirely below 4 complete days, matching the Kost calendar\'s stance', () => {
    const days = [
      { eatenKcal: 2000, isComplete: true },
      { eatenKcal: 2100, isComplete: true },
      { eatenKcal: 2200, isComplete: true },
      { eatenKcal: 0, isComplete: false },
      { eatenKcal: 0, isComplete: false },
      { eatenKcal: 0, isComplete: false },
      { eatenKcal: 0, isComplete: false },
    ]
    const result = compute7DayAverage(days, 2375)
    expect(result.avgDiffKcal).toBeNull()
    expect(result.completeDays).toBe(3)
    expect(result.incompleteDays).toBe(4)
  })

  it('computes the average diff once at least 4 days are complete', () => {
    const days = [
      { eatenKcal: 2000, isComplete: true },
      { eatenKcal: 2200, isComplete: true },
      { eatenKcal: 2400, isComplete: true },
      { eatenKcal: 2600, isComplete: true },
    ]
    const result = compute7DayAverage(days, 2375)
    // avg eaten = 2300, budget 2375 -> diff -75
    expect(result.avgDiffKcal).toBe(-75)
    expect(result.completeDays).toBe(4)
  })
})

describe('selectCheckinPeriod', () => {
  it('returns null when there are fewer than 2 weigh-ins', () => {
    expect(selectCheckinPeriod([{ date: '2026-08-01', weightKg: 105 }])).toBeNull()
  })

  it('returns null when the span between weigh-ins is under 21 days', () => {
    const result = selectCheckinPeriod([
      { date: '2026-08-01', weightKg: 105 },
      { date: '2026-08-10', weightKg: 104 },
    ])
    expect(result).toBeNull()
  })

  it('picks the oldest weigh-in at least 21 days before the latest one', () => {
    const result = selectCheckinPeriod([
      { date: '2026-07-01', weightKg: 106 }, // too old to matter, an even older eligible date exists later
      { date: '2026-08-01', weightKg: 105 },
      { date: '2026-08-25', weightKg: 103 }, // exactly 24 days after 2026-08-01
    ])
    expect(result?.periodStartDate).toBe('2026-07-01')
    expect(result?.periodEndDate).toBe('2026-08-25')
  })

  it('averages multiple weigh-ins within the first/last 7 days to dampen fluid swings', () => {
    const result = selectCheckinPeriod([
      { date: '2026-08-01', weightKg: 106 },
      { date: '2026-08-03', weightKg: 104 }, // avg with above = 105
      { date: '2026-08-25', weightKg: 101 },
      { date: '2026-08-26', weightKg: 103 }, // avg with above = 102
    ])
    expect(result?.weightStartKg).toBeCloseTo(105)
    expect(result?.weightEndKg).toBeCloseTo(102)
  })
})

describe('computeDeficitCheckin', () => {
  const base = { periodDays: 28, loggedDays: 24, loggedDeficitKcal: 375 * 24, weightStartKg: 105, avgTrainingKcalRaw: 400, oldCorrection: 0.75 }

  it('refuses to calibrate when logging coverage is too sparse', () => {
    const result = computeDeficitCheckin({ ...base, loggedDays: 10, weightEndKg: 103 })
    expect(result.status).toBe('too_sparse')
  })

  it('calls it "on track" when actual weight change roughly matches the predicted one', () => {
    // predicted: 375*24/7700 * (28/24) ≈ 1.36 kg
    const result = computeDeficitCheckin({ ...base, weightEndKg: 103.7 })
    expect(result.status).toBe('on_track')
  })

  it('suggests raising the correction factor when actual weight loss outpaced the log (real burn was higher than assumed)', () => {
    // actual loss (3 kg) is much bigger than predicted (~1.36 kg)
    const result = computeDeficitCheckin({ ...base, weightEndKg: 102 })
    expect(result.status).toBe('adjust')
    if (result.status === 'adjust') {
      expect(result.suggestedCorrection).toBeGreaterThan(base.oldCorrection)
      expect(result.suggestedCorrection).toBeLessThanOrEqual(base.oldCorrection + 0.10)
    }
  })

  it('suggests lowering the correction factor when actual weight loss lagged behind the log (training kcal were more overestimated than assumed)', () => {
    // actual loss (0.2 kg) is far less than predicted (~1.36 kg)
    const result = computeDeficitCheckin({ ...base, weightEndKg: 104.8 })
    expect(result.status).toBe('adjust')
    if (result.status === 'adjust') {
      expect(result.suggestedCorrection).toBeLessThan(base.oldCorrection)
    }
  })

  it('never suggests a correction outside the [0.5, 1.1] safety range even with an extreme mismatch', () => {
    const result = computeDeficitCheckin({ ...base, oldCorrection: 1.05, weightEndKg: 100 })
    if (result.status === 'adjust') {
      expect(result.suggestedCorrection).toBeLessThanOrEqual(1.10)
    }
    const result2 = computeDeficitCheckin({ ...base, oldCorrection: 0.55, weightEndKg: 105.5 })
    if (result2.status === 'adjust') {
      expect(result2.suggestedCorrection).toBeGreaterThanOrEqual(0.50)
    }
  })

  it('treats a negligible predicted change as too small a sample to calibrate from', () => {
    const result = computeDeficitCheckin({ ...base, loggedDeficitKcal: 50 * 24, weightEndKg: 104.9 })
    expect(result.status).toBe('too_small_sample')
  })
})
