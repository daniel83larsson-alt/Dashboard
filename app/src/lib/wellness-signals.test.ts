import { describe, it, expect } from 'vitest'
import { computeRestingHrSignal, computeSleepContext } from './wellness-signals'

const TODAY = '2026-08-30'

function dateKeysBack(days: number): string {
  const d = new Date(`${TODAY}T00:00:00`)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

describe('computeRestingHrSignal', () => {
  it('reports insufficient_data with fewer than 14 baseline days', () => {
    const history = Array.from({ length: 5 }, (_, i) => ({ date: dateKeysBack(8 + i), restingHR: 60, bodyBattery: 70 }))
    const result = computeRestingHrSignal(history, TODAY)
    expect(result.status).toBe('insufficient_data')
  })

  it('is ok when recent resting HR sits at baseline', () => {
    const history = [
      ...Array.from({ length: 28 }, (_, i) => ({ date: dateKeysBack(8 + i), restingHR: 60, bodyBattery: 70 })),
      ...Array.from({ length: 3 }, (_, i) => ({ date: dateKeysBack(i), restingHR: 61, bodyBattery: 70 })),
    ]
    const result = computeRestingHrSignal(history, TODAY)
    expect(result.status).toBe('ok')
    expect(result.baselineBpm).toBe(60)
  })

  it('flags elevated after 3 consecutive days meaningfully above baseline', () => {
    const history = [
      ...Array.from({ length: 28 }, (_, i) => ({ date: dateKeysBack(8 + i), restingHR: 60, bodyBattery: 70 })),
      ...Array.from({ length: 3 }, (_, i) => ({ date: dateKeysBack(i), restingHR: 68, bodyBattery: 70 })), // +8, well above the ~4.2 margin
    ]
    const result = computeRestingHrSignal(history, TODAY)
    expect(result.status).toBe('elevated')
    expect(result.consecutiveElevatedDays).toBe(3)
  })

  it('does not flag a single elevated day (breaks the consecutive streak)', () => {
    const history = [
      ...Array.from({ length: 28 }, (_, i) => ({ date: dateKeysBack(8 + i), restingHR: 60, bodyBattery: 70 })),
      { date: dateKeysBack(0), restingHR: 68, bodyBattery: 70 },
      { date: dateKeysBack(1), restingHR: 60, bodyBattery: 70 }, // breaks the streak
      { date: dateKeysBack(2), restingHR: 68, bodyBattery: 70 },
    ]
    const result = computeRestingHrSignal(history, TODAY)
    expect(result.status).toBe('ok')
  })

  it('corroborates with Body Battery only when it independently confirms low battery on the same elevated days', () => {
    const elevatedNoBB = [
      ...Array.from({ length: 28 }, (_, i) => ({ date: dateKeysBack(8 + i), restingHR: 60, bodyBattery: 70 })),
      ...Array.from({ length: 3 }, (_, i) => ({ date: dateKeysBack(i), restingHR: 68, bodyBattery: 70 })),
    ]
    expect(computeRestingHrSignal(elevatedNoBB, TODAY).bodyBatteryCorroborates).toBe(false)

    const elevatedWithLowBB = [
      ...Array.from({ length: 28 }, (_, i) => ({ date: dateKeysBack(8 + i), restingHR: 60, bodyBattery: 70 })),
      ...Array.from({ length: 3 }, (_, i) => ({ date: dateKeysBack(i), restingHR: 68, bodyBattery: 25 })),
    ]
    expect(computeRestingHrSignal(elevatedWithLowBB, TODAY).bodyBatteryCorroborates).toBe(true)
  })
})

describe('computeSleepContext', () => {
  it('returns null average below 4 nights of data', () => {
    const history = [{ date: dateKeysBack(0), sleepHours: 7 }, { date: dateKeysBack(1), sleepHours: 6.5 }]
    const result = computeSleepContext(history, TODAY)
    expect(result.avgSleepHours).toBeNull()
    expect(result.nights).toBe(2)
  })

  it('averages sleep hours over the last 7 days once there is enough data', () => {
    const history = Array.from({ length: 7 }, (_, i) => ({ date: dateKeysBack(i), sleepHours: 7 }))
    const result = computeSleepContext(history, TODAY)
    expect(result.avgSleepHours).toBe(7)
    expect(result.nights).toBe(7)
  })

  it('ignores zero/missing nights rather than treating them as 0 hours slept', () => {
    const history = [
      { date: dateKeysBack(0), sleepHours: 7 },
      { date: dateKeysBack(1), sleepHours: 7 },
      { date: dateKeysBack(2), sleepHours: 7 },
      { date: dateKeysBack(3), sleepHours: 7 },
      { date: dateKeysBack(4), sleepHours: 0 }, // no sync that night — not "slept 0 hours"
    ]
    const result = computeSleepContext(history, TODAY)
    expect(result.nights).toBe(4)
    expect(result.avgSleepHours).toBe(7)
  })
})
