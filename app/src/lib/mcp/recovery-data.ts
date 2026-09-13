// Pure: builds get_recovery_data(days)'s JSON payload from already-fetched
// Garmin wellness history.
import { computeRestingHrSignal } from '@/lib/wellness-signals'
import type { DayWellness } from '@/lib/garmin-sync'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function avg(history: DayWellness[], startKey: string, endKeyInclusive: string, key: keyof DayWellness): number | null {
  const vals = history
    .filter(d => d.date >= startKey && d.date <= endKeyInclusive)
    .map(d => d[key])
    .filter((v): v is number => typeof v === 'number')
  return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null
}

const RESTING_HR_TREND_LABELS: Record<'ok' | 'elevated' | 'insufficient_data', string | null> = {
  ok: 'stabil',
  elevated: 'förhöjd',
  insufficient_data: null,
}

export type RecoveryData = {
  period_days: number
  sleep_avg_hours: number | null
  sleep_avg_hours_prev_period: number | null
  steps_avg_per_day: number | null
  steps_target_per_day: number
  resting_hr_trend: string | null
  body_battery_avg: number | null
}

export function computeRecoveryData(
  wellnessHistory: DayWellness[],
  stepsTargetPerDay: number,
  days: number,
  todayKey: string,
): RecoveryData {
  const periodStartKey = addDays(todayKey, -(days - 1))
  const prevPeriodEndKey = addDays(periodStartKey, -1)
  const prevPeriodStartKey = addDays(prevPeriodEndKey, -(days - 1))

  const restingHrSignal = computeRestingHrSignal(
    wellnessHistory.map(d => ({ date: d.date, restingHR: d.restingHR, bodyBattery: d.bodyBattery })),
    todayKey,
  )

  return {
    period_days: days,
    sleep_avg_hours: avg(wellnessHistory, periodStartKey, todayKey, 'sleepHours'),
    sleep_avg_hours_prev_period: avg(wellnessHistory, prevPeriodStartKey, prevPeriodEndKey, 'sleepHours'),
    steps_avg_per_day: avg(wellnessHistory, periodStartKey, todayKey, 'steps'),
    steps_target_per_day: stepsTargetPerDay,
    resting_hr_trend: RESTING_HR_TREND_LABELS[restingHrSignal.status],
    body_battery_avg: avg(wellnessHistory, periodStartKey, todayKey, 'bodyBattery'),
  }
}
