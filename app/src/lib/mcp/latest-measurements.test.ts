import { describe, it, expect } from 'vitest'
import { computeLatestMeasurements } from './latest-measurements'
import type { McpMeasurement } from './fetch-user-data'

const TODAY = '2026-09-13'

describe('computeLatestMeasurements', () => {
  it('picks the most recent weight and waist independently when logged on different days', () => {
    const measurements: McpMeasurement[] = [
      { date: '2026-09-01', weightKg: 108, waistCm: null },
      { date: '2026-09-10', weightKg: 105.5, waistCm: null },
      { date: '2026-09-05', weightKg: null, waistCm: 104 },
    ]
    const result = computeLatestMeasurements(measurements, TODAY)
    expect(result.weight_kg).toBe(105.5)
    expect(result.weight_date).toBe('2026-09-10')
    expect(result.waist_cm).toBe(104)
    expect(result.waist_date).toBe('2026-09-05')
    expect(result.days_since_last_weigh_in).toBe(3)
    expect(result.days_since_last_waist_measurement).toBe(8)
  })

  it('is unaffected by input order', () => {
    const measurements: McpMeasurement[] = [
      { date: '2026-09-10', weightKg: 105.5, waistCm: null },
      { date: '2026-09-01', weightKg: 108, waistCm: null },
    ]
    const result = computeLatestMeasurements(measurements, TODAY)
    expect(result.weight_kg).toBe(105.5)
  })

  it('returns nulls when nothing has ever been logged', () => {
    const result = computeLatestMeasurements([], TODAY)
    expect(result.weight_kg).toBeNull()
    expect(result.days_since_last_weigh_in).toBeNull()
  })
})
