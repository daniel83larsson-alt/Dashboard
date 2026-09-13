// Pure: builds get_latest_measurements()'s JSON payload from the same
// McpMeasurement[] weekly-summary.ts already reads (weight and waist are
// looked up independently since either can be null on a given day).
import type { McpMeasurement } from './fetch-user-data'

function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`).getTime()
  const end = new Date(`${endISO}T00:00:00`).getTime()
  return Math.round((end - start) / 86400000)
}

export type LatestMeasurements = {
  weight_kg: number | null
  weight_date: string | null
  waist_cm: number | null
  waist_date: string | null
  days_since_last_weigh_in: number | null
  days_since_last_waist_measurement: number | null
}

export function computeLatestMeasurements(measurements: McpMeasurement[], todayKey: string): LatestMeasurements {
  const weighIns = measurements
    .filter((m): m is typeof m & { weightKg: number } => m.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const waistPoints = measurements
    .filter((m): m is typeof m & { waistCm: number } => m.waistCm != null)
    .sort((a, b) => a.date.localeCompare(b.date))

  const lastWeighIn = weighIns.length ? weighIns[weighIns.length - 1] : null
  const lastWaist = waistPoints.length ? waistPoints[waistPoints.length - 1] : null

  return {
    weight_kg: lastWeighIn?.weightKg ?? null,
    weight_date: lastWeighIn?.date ?? null,
    waist_cm: lastWaist?.waistCm ?? null,
    waist_date: lastWaist?.date ?? null,
    days_since_last_weigh_in: lastWeighIn ? daysBetween(lastWeighIn.date, todayKey) : null,
    days_since_last_waist_measurement: lastWaist ? daysBetween(lastWaist.date, todayKey) : null,
  }
}
