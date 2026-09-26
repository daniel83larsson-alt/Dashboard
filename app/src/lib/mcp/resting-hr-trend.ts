// Pure: builds get_resting_hr_trend(weeks)'s JSON payload — same
// {week_end_date, value} shape as tdee-trend.ts's TdeeTrend, but averaging
// the daily DayWellness.restingHR history (garmin_wellness) per week
// instead of reconstructing a budget-event log. No new data source: this
// is the exact same wellness history get_rowing_trends/get_recovery_data
// already read via fetchMcpWellnessHistory, up to 365 days of it.
import type { DayWellness } from '@/lib/garmin-sync'

export type RestingHrTrendPoint = {
  week_end_date: string // YYYY-MM-DD
  resting_hr_avg: number | null // null when no Garmin reading fell in that week
}

export type RestingHrTrend = {
  period_weeks: number
  points: RestingHrTrendPoint[]
}

export function computeRestingHrTrend(
  wellnessHistory: DayWellness[],
  todayKey: string,
  weeks: number,
): RestingHrTrend {
  const points: RestingHrTrendPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(`${todayKey}T00:00:00`)
    weekEnd.setDate(weekEnd.getDate() - i * 7)
    const weekEndKey = weekEnd.toISOString().slice(0, 10)
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekStart.getDate() - 6)
    const weekStartKey = weekStart.toISOString().slice(0, 10)

    const vals = wellnessHistory
      .filter(d => d.date >= weekStartKey && d.date <= weekEndKey && typeof d.restingHR === 'number')
      .map(d => d.restingHR as number)

    points.push({
      week_end_date: weekEndKey,
      resting_hr_avg: vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null,
    })
  }
  return { period_weeks: weeks, points }
}
