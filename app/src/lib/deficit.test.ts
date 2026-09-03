import { describe, it, expect } from 'vitest'
import {
  computeDeficitBudget, dailyDiffStatus, compute7DayAverage, computeDeficitCheckin, selectCheckinPeriod,
  computeRollingWeightAverage, resolveActiveGoalSegment, deficitOverrideSignature,
} from './deficit'

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

  it('reports no safety breaches and overrideActive false for a safe goal', () => {
    const result = computeDeficitBudget({
      bmr: 1960,
      goal: { startWeightKg: 105, targetWeightKg: 90, targetDateISO: '2027-06-30', neatFactor: 1.25, garminCorrection: 0.75 },
      avgTrainingKcalRaw: 400,
      activityFallbackKcal: 300,
      now: NOW,
    })
    expect(result.safety.breaches).toEqual([])
    expect(result.overrideActive).toBe(false)
    expect(result.safety.suggestedTargetDateISO).toBeNull()
  })

  it('allowUnsafe lets an above-safe budget through, still bounded by the ABSOLUTE hard floor', () => {
    const goal = { startWeightKg: 105, targetWeightKg: 85, targetDateISO: '2026-09-29', neatFactor: 1.25, garminCorrection: 0.75 }
    const safe = computeDeficitBudget({ bmr: 1960, goal, avgTrainingKcalRaw: 400, activityFallbackKcal: 300, now: NOW })
    const overridden = computeDeficitBudget({ bmr: 1960, goal, avgTrainingKcalRaw: 400, activityFallbackKcal: 300, now: NOW, allowUnsafe: true })

    expect(safe.overrideActive).toBe(false)
    expect(overridden.overrideActive).toBe(true)
    expect(overridden.capped).toBe(false)
    // The hard ceiling (ABSOLUTE_MAX_DEFICIT_KCAL=1500) binds here since the
    // requested deficit (~5133) is far beyond it.
    expect(overridden.dailyDeficitKcal).toBe(1500)
    expect(overridden.budgetKcal).toBe(overridden.tdeeKcal - 1500)
    // Overridden budget is a real, above-hard-floor number, and it's a
    // meaningfully bigger deficit than the safe fallback would have used.
    expect(overridden.dailyDeficitKcal).toBeGreaterThan(safe.dailyDeficitKcal)
    // Still not the literal requested (~5133) deficit — the hard floor clamped it.
    expect(overridden.dailyDeficitKcal).toBeLessThan(overridden.safety.requestedDailyDeficitKcal)
    // suggestedTargetDateISO is only mirrored at the top level when capped
    // (unchanged meaning), but the safe alternative is still visible via safety.
    expect(overridden.suggestedTargetDateISO).toBeNull()
    expect(overridden.safety.suggestedTargetDateISO).not.toBeNull()
  })

  it('the ABSOLUTE budget floor (1200) cannot be pushed lower even with allowUnsafe, when it binds tighter than the deficit ceiling', () => {
    // tdee is low enough here that ABSOLUTE_MIN_BUDGET_KCAL, not
    // ABSOLUTE_MAX_DEFICIT_KCAL, ends up being the binding constraint.
    const result = computeDeficitBudget({
      bmr: 1800,
      goal: { startWeightKg: 100, targetWeightKg: 70, targetDateISO: '2026-09-09', neatFactor: 1.1, garminCorrection: 1 }, // 30kg in 10 days
      avgTrainingKcalRaw: 0,
      activityFallbackKcal: 0,
      now: NOW,
      allowUnsafe: true,
    })
    expect(result.tdeeKcal).toBe(1980)
    expect(result.budgetKcal).toBe(1200) // the hard floor, not tdee-1500 (=480)
    expect(result.overrideActive).toBe(true)
  })

  it('a mildly-breaching goal (below the safe budget floor, but not above the max deficit) only reports that one breach', () => {
    // ~700 kcal/day deficit: over the ~2156 budget floor, but nowhere near
    // the 1000 kcal/day safe-deficit ceiling or the 1500/1200 hard limits.
    const result = computeDeficitBudget({
      bmr: 1960,
      goal: { startWeightKg: 105, targetWeightKg: 90, targetDateISO: '2027-02-11', neatFactor: 1.25, garminCorrection: 0.75 },
      avgTrainingKcalRaw: 400,
      activityFallbackKcal: 300,
      now: NOW,
    })
    expect(result.safety.breaches).toContain('below_budget_floor')
    expect(result.safety.breaches).not.toContain('deficit_above_max')
    expect(result.safety.breaches).not.toContain('below_hard_floor')
    expect(result.capped).toBe(true)
  })
})

describe('deficitOverrideSignature', () => {
  it('is stable for the same goal', () => {
    const goal = { startWeightKg: 105, targetWeightKg: 90, targetDateISO: '2027-06-30' }
    expect(deficitOverrideSignature(goal)).toBe(deficitOverrideSignature({ ...goal }))
  })

  it('changes when the target weight or date changes, so a stale acknowledgement never silently carries over', () => {
    const base = deficitOverrideSignature({ startWeightKg: 105, targetWeightKg: 90, targetDateISO: '2027-06-30' })
    expect(deficitOverrideSignature({ startWeightKg: 105, targetWeightKg: 88, targetDateISO: '2027-06-30' })).not.toBe(base)
    expect(deficitOverrideSignature({ startWeightKg: 105, targetWeightKg: 90, targetDateISO: '2027-05-01' })).not.toBe(base)
  })
})

describe('computeRollingWeightAverage', () => {
  it('returns null avgKg below minReadings, same "hellre inget än ett tal som ser exakt ut" stance as compute7DayAverage', () => {
    const result = computeRollingWeightAverage([{ date: '2026-08-30', weightKg: 107 }], '2026-08-30', { minReadings: 2 })
    expect(result.avgKg).toBeNull()
    expect(result.readings).toBe(1)
    expect(result.latestKg).toBe(107)
  })

  it('averages the most recent readings within the window once minReadings is met', () => {
    const weighIns = [
      { date: '2026-08-28', weightKg: 108 },
      { date: '2026-08-29', weightKg: 107 },
      { date: '2026-08-30', weightKg: 106 },
    ]
    const result = computeRollingWeightAverage(weighIns, '2026-08-30', { windowDays: 10, maxReadings: 3, minReadings: 2 })
    expect(result.avgKg).toBeCloseTo(107)
    expect(result.readings).toBe(3)
    expect(result.latestKg).toBe(106)
    expect(result.latestDate).toBe('2026-08-30')
  })

  it('ignores readings outside the window', () => {
    const weighIns = [
      { date: '2026-01-01', weightKg: 120 }, // ancient, outside any reasonable window
      { date: '2026-08-30', weightKg: 106 },
    ]
    const result = computeRollingWeightAverage(weighIns, '2026-08-30', { windowDays: 10, maxReadings: 3, minReadings: 1 })
    expect(result.avgKg).toBe(106)
    expect(result.readings).toBe(1)
  })
})

describe('resolveActiveGoalSegment', () => {
  const overall = { startWeightKg: 105, targetWeightKg: 90, targetDateISO: '2027-06-30', overrideAcknowledged: false }

  it('falls back to the overall goal when there is no milestone', () => {
    const result = resolveActiveGoalSegment({ overall, milestone: null, todayKey: '2026-08-30' })
    expect(result.source).toBe('overall')
    expect(result.milestoneExpired).toBe(false)
  })

  it('uses the milestone when it is valid and still in the future', () => {
    const milestone = { targetWeightKg: 99, targetDateISO: '2026-11-01', overrideAcknowledged: true }
    const result = resolveActiveGoalSegment({ overall, milestone, todayKey: '2026-08-30' })
    expect(result.source).toBe('milestone')
    expect(result.targetWeightKg).toBe(99)
    expect(result.validUntilISO).toBe('2026-11-01')
    expect(result.overrideAcknowledged).toBe(true)
  })

  it('falls back to the overall goal, flagged expired, once the milestone date has passed', () => {
    const milestone = { targetWeightKg: 99, targetDateISO: '2026-08-01', overrideAcknowledged: false }
    const result = resolveActiveGoalSegment({ overall, milestone, todayKey: '2026-08-30' })
    expect(result.source).toBe('overall')
    expect(result.milestoneExpired).toBe(true)
  })

  it('treats the milestone date itself as still active (the last day of a milestone is a milestone day)', () => {
    const milestone = { targetWeightKg: 99, targetDateISO: '2026-08-30', overrideAcknowledged: false }
    const result = resolveActiveGoalSegment({ overall, milestone, todayKey: '2026-08-30' })
    expect(result.source).toBe('milestone')
  })

  it('rejects a milestone that goes the wrong direction (heavier than the starting weight, for a loss goal)', () => {
    const milestone = { targetWeightKg: 110, targetDateISO: '2026-11-01', overrideAcknowledged: false }
    const result = resolveActiveGoalSegment({ overall, milestone, todayKey: '2026-08-30' })
    expect(result.source).toBe('overall')
    expect(result.milestoneRejectedReason).toBe('wrong_direction')
  })

  it('rejects a milestone lighter than the overall target (more aggressive than the final goal)', () => {
    const milestone = { targetWeightKg: 85, targetDateISO: '2026-11-01', overrideAcknowledged: false }
    const result = resolveActiveGoalSegment({ overall, milestone, todayKey: '2026-08-30' })
    expect(result.milestoneRejectedReason).toBe('beyond_overall_target')
  })

  it('rejects a milestone dated on/after the overall target date', () => {
    const milestone = { targetWeightKg: 99, targetDateISO: '2027-06-30', overrideAcknowledged: false }
    const result = resolveActiveGoalSegment({ overall, milestone, todayKey: '2026-08-30' })
    expect(result.milestoneRejectedReason).toBe('not_before_overall_date')
  })

  it('mirrors the rules for a "gain" goal', () => {
    const gainOverall = { startWeightKg: 70, targetWeightKg: 80, targetDateISO: '2027-06-30', overrideAcknowledged: false }
    const validMilestone = { targetWeightKg: 74, targetDateISO: '2026-11-01', overrideAcknowledged: false }
    expect(resolveActiveGoalSegment({ overall: gainOverall, milestone: validMilestone, todayKey: '2026-08-30' }).source).toBe('milestone')

    const wrongDirection = { targetWeightKg: 68, targetDateISO: '2026-11-01', overrideAcknowledged: false }
    expect(resolveActiveGoalSegment({ overall: gainOverall, milestone: wrongDirection, todayKey: '2026-08-30' }).milestoneRejectedReason).toBe('wrong_direction')

    const beyondTarget = { targetWeightKg: 85, targetDateISO: '2026-11-01', overrideAcknowledged: false }
    expect(resolveActiveGoalSegment({ overall: gainOverall, milestone: beyondTarget, todayKey: '2026-08-30' }).milestoneRejectedReason).toBe('beyond_overall_target')
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
