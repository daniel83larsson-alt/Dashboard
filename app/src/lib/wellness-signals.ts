// "Rest-day mode" and sleep-context signals derived from already-synced
// Garmin wellness history (coach_sessions('garmin_wellness')) — pure rules,
// no AI, no I/O. Deliberately advisory only: nothing here ever touches the
// calorie budget (lib/deficit.ts) — see the info-only banners these feed.

type WellnessDay = { date: string; restingHR: number | null; bodyBattery: number | null }

export type RestingHrSignal = {
  status: 'ok' | 'elevated' | 'insufficient_data'
  baselineBpm: number | null
  recentAvgBpm: number | null
  deltaBpm: number | null
  consecutiveElevatedDays: number
  bodyBatteryCorroborates: boolean
}

const BASELINE_MIN_DAYS = 14
const BASELINE_WINDOW_START = 8 // days back
const BASELINE_WINDOW_END = 35 // days back
const RECENT_DAYS = 3
const MIN_ELEVATED_MARGIN_BPM = 3
const ELEVATED_MARGIN_RATIO = 0.07
const LOW_BODY_BATTERY = 40

function median(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// history: most-recent-first, one row per day (matching how garmin-sync.ts
// already stores it), todayKey the Stockholm date key "now" resolves to.
export function computeRestingHrSignal(history: WellnessDay[], todayKey: string): RestingHrSignal {
  const byDate = new Map(history.map(d => [d.date, d]))
  const dateKeysBack = (days: number) => {
    const d = new Date(`${todayKey}T00:00:00`)
    d.setDate(d.getDate() - days)
    return d.toISOString().slice(0, 10)
  }

  const baselineVals: number[] = []
  for (let i = BASELINE_WINDOW_START; i <= BASELINE_WINDOW_END; i++) {
    const hr = byDate.get(dateKeysBack(i))?.restingHR
    if (typeof hr === 'number') baselineVals.push(hr)
  }
  if (baselineVals.length < BASELINE_MIN_DAYS) {
    return { status: 'insufficient_data', baselineBpm: null, recentAvgBpm: null, deltaBpm: null, consecutiveElevatedDays: 0, bodyBatteryCorroborates: false }
  }
  const baselineBpm = median(baselineVals)
  const threshold = baselineBpm + Math.max(MIN_ELEVATED_MARGIN_BPM, ELEVATED_MARGIN_RATIO * baselineBpm)

  let consecutiveElevatedDays = 0
  for (let i = 0; i < RECENT_DAYS; i++) {
    const hr = byDate.get(dateKeysBack(i))?.restingHR
    if (typeof hr === 'number' && hr > threshold) consecutiveElevatedDays++
    else break
  }

  const recentVals: number[] = []
  for (let i = 0; i < RECENT_DAYS; i++) {
    const hr = byDate.get(dateKeysBack(i))?.restingHR
    if (typeof hr === 'number') recentVals.push(hr)
  }
  const recentAvgBpm = recentVals.length ? recentVals.reduce((s, v) => s + v, 0) / recentVals.length : null

  const status = consecutiveElevatedDays >= RECENT_DAYS ? 'elevated' : 'ok'

  // Body Battery is a corroborator only, never an independent trigger — a
  // proprietary composite that already folds in resting HR, so triggering
  // on it separately would double-count one signal.
  let bodyBatteryCorroborates = false
  if (status === 'elevated') {
    const lowBBDays = Array.from({ length: RECENT_DAYS }, (_, i) => byDate.get(dateKeysBack(i))?.bodyBattery)
      .filter((bb): bb is number => typeof bb === 'number' && bb < LOW_BODY_BATTERY).length
    bodyBatteryCorroborates = lowBBDays >= RECENT_DAYS
  }

  return {
    status,
    baselineBpm: Math.round(baselineBpm * 10) / 10,
    recentAvgBpm: recentAvgBpm != null ? Math.round(recentAvgBpm * 10) / 10 : null,
    deltaBpm: recentAvgBpm != null ? Math.round((recentAvgBpm - baselineBpm) * 10) / 10 : null,
    consecutiveElevatedDays,
    bodyBatteryCorroborates,
  }
}

export type SleepContext = { avgSleepHours: number | null; nights: number }

const SLEEP_WINDOW_DAYS = 7
const MIN_SLEEP_NIGHTS = 4

export function computeSleepContext(history: { date: string; sleepHours: number | null }[], todayKey: string): SleepContext {
  const byDate = new Map(history.map(d => [d.date, d]))
  const vals: number[] = []
  for (let i = 0; i < SLEEP_WINDOW_DAYS; i++) {
    const d = new Date(`${todayKey}T00:00:00`)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const h = byDate.get(key)?.sleepHours
    if (typeof h === 'number' && h > 0) vals.push(h)
  }
  if (vals.length < MIN_SLEEP_NIGHTS) return { avgSleepHours: null, nights: vals.length }
  return { avgSleepHours: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10, nights: vals.length }
}
