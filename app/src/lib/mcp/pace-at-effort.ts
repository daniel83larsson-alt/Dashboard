// Pure: builds get_pace_at_effort(activity_type, weeks, compare_to_weeks_ago)'s
// JSON payload — groups WHOLE SESSIONS of a given activity type into 10bpm
// average-heart-rate bands and reports the aggregated pace/speed within
// each band (total distance / total time across the band's sessions, same
// aggregation style rowing-trends.ts's avgPaceSecPer500m already uses,
// rather than an average of per-session paces which would let one short
// session skew a band as much as a long one).
//
// Data-model note (see rowing-trends.ts for the fuller version of this same
// point): this is a SESSION-level band, not an intra-session one — a
// session's OWN average heart rate places it in a band, it isn't split
// into laps. True per-split HR-banded pace exists only for Concept2-sourced
// rowing, only for sessions the user has already individually opened (see
// api/activities/[id]/concept2-detail/route.ts), and isn't cached in bulk
// across a whole period — building that richer version was scoped out as
// a separate, bigger follow-up (see STATUS.md). Strength/kettlebell
// sessions have no effort signal (no RPE field anywhere in the schema) so
// they're reported as unsupported rather than guessed at.
import { resolveSportType, sportLabel, fmtSpeedOrPace, usesDistance } from '@/lib/sport'
import type { McpActivity } from './fetch-training-data'

export type HrBand = {
  hr_range: string
  performance_label: string // e.g. "Snittempo" or "Snitthastighet" (from fmtSpeedOrPace, unit-appropriate per sport)
  performance_value: string // e.g. "2:38/500m", "5:12/km", "32.1 km/h"
  sessions: number
}

export type PaceAtEffort = {
  activity_type: string
  period_weeks: number
  hr_bands: HrBand[]
  comparison_period_weeks_ago: number | null
  comparison_hr_bands: HrBand[] | null
  note: string | null
}

const HR_BAND_WIDTH = 10

function bandLow(hr: number): number {
  return Math.floor(hr / HR_BAND_WIDTH) * HR_BAND_WIDTH
}

function computeBands(acts: McpActivity[], sportType: string): HrBand[] {
  // Truthy check, not typeof === 'number' — confirmed against real synced
  // data (some Garmin activities land with average_heartrate: 0 from a
  // sensor/sync gap, never a genuine human resting rate), same convention
  // every other consumer of this field already uses across the codebase
  // (e.g. dashboard/page.tsx, load.ts, plan/generate/route.ts all do
  // `a.average_heartrate ? ... : ...` rather than a typeof check) — a 0
  // would otherwise silently pollute a fake "0-10" band.
  const eligible = acts.filter(a =>
    a.sport_type === sportType && a.distance > 0 && a.moving_time > 0 && a.average_heartrate
  )
  const byBand = new Map<number, { distance: number; time: number; count: number }>()
  for (const a of eligible) {
    const low = bandLow(a.average_heartrate as number)
    const entry = byBand.get(low) ?? { distance: 0, time: 0, count: 0 }
    entry.distance += a.distance
    entry.time += a.moving_time
    entry.count++
    byBand.set(low, entry)
  }
  return [...byBand.entries()]
    .sort(([a], [b]) => a - b)
    .map(([low, v]) => {
      const perf = fmtSpeedOrPace(sportType, v.distance, v.time)
      return {
        hr_range: `${low}-${low + HR_BAND_WIDTH}`,
        performance_label: perf?.label ?? '',
        performance_value: perf?.value ?? '',
        sessions: v.count,
      }
    })
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function computePaceAtEffort(
  activities: McpActivity[],
  activityType: string,
  weeks: number,
  todayKey: string,
  compareToWeeksAgo?: number | null,
): PaceAtEffort {
  const sportType = resolveSportType(activityType)

  if (!sportType) {
    return {
      activity_type: activityType,
      period_weeks: weeks,
      hr_bands: [],
      comparison_period_weeks_ago: compareToWeeksAgo ?? null,
      comparison_hr_bands: null,
      note: `Okänd aktivitetstyp "${activityType}" — hittade ingen matchning bland loggade aktivitetstyper.`,
    }
  }

  const label = sportLabel(sportType)

  if (!usesDistance(sportType)) {
    return {
      activity_type: label,
      period_weeks: weeks,
      hr_bands: [],
      comparison_period_weeks_ago: compareToWeeksAgo ?? null,
      comparison_hr_bands: null,
      note: `${label} mäts inte i tempo/distans i appen idag (och saknar en ansträngningsnivå som RPE), så prestanda-vid-ansträngning kan inte räknas ut för den här aktivitetstypen ännu.`,
    }
  }

  const periodStartKey = addDays(todayKey, -weeks * 7)
  const inPeriod = activities.filter(a => {
    const d = a.start_date.slice(0, 10)
    return d >= periodStartKey && d <= todayKey
  })
  const hrBands = computeBands(inPeriod, sportType)

  let comparisonBands: HrBand[] | null = null
  if (compareToWeeksAgo != null) {
    const compareEndKey = addDays(todayKey, -compareToWeeksAgo * 7)
    const compareStartKey = addDays(compareEndKey, -weeks * 7)
    const inComparePeriod = activities.filter(a => {
      const d = a.start_date.slice(0, 10)
      return d > compareStartKey && d <= compareEndKey
    })
    comparisonBands = computeBands(inComparePeriod, sportType)
  }

  return {
    activity_type: label,
    period_weeks: weeks,
    hr_bands: hrBands,
    comparison_period_weeks_ago: compareToWeeksAgo ?? null,
    comparison_hr_bands: comparisonBands,
    note: hrBands.length === 0 ? `Inga ${label}-pass med registrerad puls hittades under perioden.` : null,
  }
}
