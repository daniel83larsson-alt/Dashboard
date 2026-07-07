import { fmtSpeedOrPace } from './sport'

export type Activity = {
  id: string
  start_date: string
  distance: number
  moving_time: number
  sport_type: string
}

export type PR = { value: number; unit: string; date: string; display: string; activityId: string }
export type SportPRs = { sport: string; totalDist: number; prs: { label: string; pr: PR }[] }

// Same best-effort-window convention rowing PRs use (best distance covered
// in ~20/30/45 min), generalized to any distance-based sport so each one
// gets its own personal bests instead of only rowing having them.
export const TIME_WINDOWS = [
  { label: '20 min', minSec: 1050, maxSec: 1350 },
  { label: '30 min', minSec: 1620, maxSec: 1980 },
  { label: '45 min', minSec: 2460, maxSec: 3000 },
]

// Standard race-style benchmark distances, applied the same way to every
// distance-eligible sport rather than one bespoke distance per sport —
// Daniel asked for "snabbast 1/3/5/10km" across the board.
export const UNIVERSAL_BENCHMARKS: { meters: number; label: string }[] = [
  { meters: 1000, label: '1 km' },
  { meters: 3000, label: '3 km' },
  { meters: 5000, label: '5 km' },
  { meters: 10000, label: '10 km' },
]

// Cycling PRs conventionally go longer than the universal set — kept as an
// addition rather than a replacement.
export const EXTRA_BENCHMARKS: Record<string, { meters: number; label: string }[]> = {
  Ride: [{ meters: 20000, label: '20 km' }],
  VirtualRide: [{ meters: 20000, label: '20 km' }],
}

export function benchmarksForSport(sport: string) {
  return [...UNIVERSAL_BENCHMARKS, ...(EXTRA_BENCHMARKS[sport] ?? [])]
}

// Only sports where distance/pace PRs are meaningful — strength/yoga/etc.
// don't fit this "personal best" shape and are left out.
export const PR_ELIGIBLE_SPORTS = new Set(['Rowing', 'Run', 'TrailRun', 'Walk', 'Hike', 'Ride', 'VirtualRide', 'Swim', 'NordicSki'])

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }
function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export function computeSportPRs(acts: Activity[], sport: string): SportPRs {
  const real = acts.filter(a => a.sport_type === sport && a.distance >= 200 && a.moving_time >= 60)
  const prs: { label: string; pr: PR }[] = []

  for (const w of TIME_WINDOWS) {
    const inWindow = real.filter(a => a.moving_time >= w.minSec && a.moving_time <= w.maxSec)
    if (!inWindow.length) continue
    const best = inWindow.reduce((b, c) => c.distance > b.distance ? c : b)
    const speedOrPace = fmtSpeedOrPace(sport, best.distance, best.moving_time)
    prs.push({
      label: `Bäst ${w.label}`,
      pr: { value: best.distance, unit: 'm', date: best.start_date, activityId: best.id, display: `${fmtKm(best.distance)}${speedOrPace ? ` · ${speedOrPace.value}` : ''}` },
    })
  }

  for (const bench of benchmarksForSport(sport)) {
    const near = real.filter(a => a.distance >= bench.meters * 0.96 && a.distance <= bench.meters * 1.04)
    if (!near.length) continue
    const fastest = near.reduce((b, c) => c.moving_time < b.moving_time ? c : b)
    const speedOrPace = fmtSpeedOrPace(sport, fastest.distance, fastest.moving_time)
    prs.push({
      label: `Snabbaste ${bench.label}`,
      pr: { value: fastest.moving_time, unit: 's', date: fastest.start_date, activityId: fastest.id, display: `${fmtDur(fastest.moving_time)}${speedOrPace ? ` · ${speedOrPace.value}` : ''}` },
    })
  }

  const totalDist = real.reduce((s, a) => s + a.distance, 0)
  return { sport, totalDist, prs }
}

export function computeAllSportPRs(acts: Activity[]): SportPRs[] {
  const sports = [...new Set(acts.map(a => a.sport_type))].filter(s => PR_ELIGIBLE_SPORTS.has(s))
  return sports
    .map(sport => computeSportPRs(acts, sport))
    .filter(s => s.prs.length > 0)
    .sort((a, b) => b.totalDist - a.totalDist)
}

export function longestSession(acts: Activity[]): Activity | null {
  const valid = acts.filter(a => a.moving_time >= 60)
  if (!valid.length) return null
  return valid.reduce((b, c) => c.moving_time > b.moving_time ? c : b)
}

// Daniel: "en medalj om man slår sitt rekord" på Översikt, för det senaste
// passet. Compares the latest activity against every PRIOR activity only —
// a category with no prior qualifying activity has nothing to "break", so
// it's deliberately excluded (a first-ever 5km isn't a broken record).
export function newRecordsForLatest(latest: Activity, priorActivities: Activity[]): string[] {
  const hits: string[] = []
  const sport = latest.sport_type
  const priorSameSport = priorActivities.filter(a => a.sport_type === sport)

  if (PR_ELIGIBLE_SPORTS.has(sport) && latest.distance >= 200 && latest.moving_time >= 60) {
    for (const w of TIME_WINDOWS) {
      if (latest.moving_time < w.minSec || latest.moving_time > w.maxSec) continue
      const priorInWindow = priorSameSport.filter(a => a.moving_time >= w.minSec && a.moving_time <= w.maxSec && a.distance >= 200)
      if (!priorInWindow.length) continue
      const priorBest = Math.max(...priorInWindow.map(a => a.distance))
      if (latest.distance > priorBest) hits.push(`Bäst ${w.label}`)
    }
    for (const bench of benchmarksForSport(sport)) {
      if (latest.distance < bench.meters * 0.96 || latest.distance > bench.meters * 1.04) continue
      const priorNear = priorSameSport.filter(a => a.distance >= bench.meters * 0.96 && a.distance <= bench.meters * 1.04)
      if (!priorNear.length) continue
      const priorBest = Math.min(...priorNear.map(a => a.moving_time))
      if (latest.moving_time < priorBest) hits.push(`Snabbaste ${bench.label}`)
    }
  }

  if (latest.moving_time >= 60) {
    const priorLongest = priorActivities.filter(a => a.moving_time >= 60)
    if (priorLongest.length) {
      const priorBest = Math.max(...priorLongest.map(a => a.moving_time))
      if (latest.moving_time > priorBest) hits.push('Längsta passet någonsin')
    }
  }

  return hits
}
