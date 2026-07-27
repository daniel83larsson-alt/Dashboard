// Self-calculated VO2max estimate for when Garmin doesn't provide one
// (some watches never compute it) — uses the Daniels-Gilbert running
// formula (Jack Daniels & Jimmy Gilbert, "Oxygen Power", 1979), a
// well-established open formula that only needs a race-like effort's
// distance + time, no heart-rate sensor required. Running-only: the
// velocity-based oxygen-cost model isn't valid for rowing/cycling/etc.

// Reliable roughly for efforts between 3 and 60 minutes — outside that
// window the formula's error grows too large to call it an estimate.
const MIN_SECONDS = 180
const MAX_SECONDS = 3600
const MIN_DISTANCE_M = 1500

export function estimateVo2maxFromRun(distanceMeters: number, timeSeconds: number): number | null {
  if (timeSeconds < MIN_SECONDS || timeSeconds > MAX_SECONDS || distanceMeters < MIN_DISTANCE_M) return null
  const t = timeSeconds / 60 // minutes
  const v = distanceMeters / t // meters per minute
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v
  const pctVo2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)
  const vo2max = vo2 / pctVo2max
  return vo2max > 0 ? Math.round(vo2max * 10) / 10 : null
}

const VO2MAX_ELIGIBLE_SPORTS = new Set(['Run', 'TrailRun'])

export function bestVo2maxEstimate(
  activities: { sport_type: string; distance: number; moving_time: number; start_date: string }[],
  withinDays = 90,
): { vo2max: number; date: string } | null {
  const cutoff = Date.now() - withinDays * 86400000
  let best: { vo2max: number; date: string } | null = null
  for (const a of activities) {
    if (!VO2MAX_ELIGIBLE_SPORTS.has(a.sport_type)) continue
    if (new Date(a.start_date).getTime() < cutoff) continue
    const value = estimateVo2maxFromRun(a.distance, a.moving_time)
    if (value != null && (!best || value > best.vo2max)) best = { vo2max: value, date: a.start_date }
  }
  return best
}
