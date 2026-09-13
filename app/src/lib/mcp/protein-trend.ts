// Pure: builds get_protein_trend()'s exact JSON payload. Nothing in the
// app already computes this shape — weekly-kost.ts's avgProteinG is a
// calendar-week figure with no per-day min/max or target-count breakdown,
// and nutrition-summary.ts never resolves protein per day at all — so this
// is genuinely new, built the same way (day-by-day via resolveDayProteinG,
// then aggregate) as everything else in this app that averages a window.
import { resolveDayProteinG } from '@/lib/day-nutrition-source'
import { dateKeysEndingToday } from './window'
import type { McpUserData } from './fetch-user-data'

export type ProteinTrend = {
  period_days: number
  protein_avg_g_per_day: number | null
  protein_target_g_per_day: number | null
  days_at_or_above_target: number | null
  days_below_target: number | null
  lowest_day: { date: string; protein_g: number } | null
  highest_day: { date: string; protein_g: number } | null
}

export function computeProteinTrend(data: McpUserData, todayKey: string, days: number): ProteinTrend {
  const { profile, yazioByDate, manualByDate, dayOverrides, trackedMeals } = data
  const dateKeys = dateKeysEndingToday(todayKey, days)
  const targetG = profile?.protein_goal_g ?? null

  const withData = dateKeys
    .map(date => ({ date, proteinG: resolveDayProteinG(date, yazioByDate, manualByDate, trackedMeals, dayOverrides).proteinG }))
    .filter((d): d is { date: string; proteinG: number } => d.proteinG != null)

  const avgG = withData.length ? Math.round(withData.reduce((s, d) => s + d.proteinG, 0) / withData.length) : null

  let lowest = withData[0] ?? null
  let highest = withData[0] ?? null
  for (const d of withData) {
    if (d.proteinG < lowest!.proteinG) lowest = d
    if (d.proteinG > highest!.proteinG) highest = d
  }

  return {
    period_days: days,
    protein_avg_g_per_day: avgG,
    protein_target_g_per_day: targetG,
    days_at_or_above_target: targetG != null ? withData.filter(d => d.proteinG >= targetG).length : null,
    days_below_target: targetG != null ? withData.filter(d => d.proteinG < targetG).length : null,
    lowest_day: lowest ? { date: lowest.date, protein_g: lowest.proteinG } : null,
    highest_day: highest ? { date: highest.date, protein_g: highest.proteinG } : null,
  }
}
