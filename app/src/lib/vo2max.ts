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

// Age/sex-normed fitness categories — the same six-tier bands published by
// the Cooper Institute and widely reused across fitness trackers (Garmin's
// own VO2max gauge included). Each bracket's `bounds` are the four cutoffs
// between the six tiers (ml/kg/min); a value below bounds[0] is "Låg", at
// or above bounds[3] is "Elit". Norms diverge enough by age and sex that a
// single unisex scale would misclassify most people, so both are required
// inputs — callers without them should skip rating rather than guess.
const VO2MAX_NORMS: Record<'male' | 'female', { maxAge: number; bounds: [number, number, number, number, number] }[]> = {
  male: [
    { maxAge: 29, bounds: [25, 34, 43, 53, 60] },
    { maxAge: 39, bounds: [23, 31, 39, 49, 56] },
    { maxAge: 49, bounds: [20, 27, 36, 45, 53] },
    { maxAge: 59, bounds: [18, 25, 34, 43, 50] },
    { maxAge: Infinity, bounds: [16, 23, 31, 41, 46] },
  ],
  female: [
    { maxAge: 29, bounds: [24, 31, 38, 49, 57] },
    { maxAge: 39, bounds: [20, 28, 34, 45, 53] },
    { maxAge: 49, bounds: [17, 24, 31, 42, 50] },
    { maxAge: 59, bounds: [15, 21, 28, 38, 45] },
    { maxAge: Infinity, bounds: [13, 18, 24, 35, 42] },
  ],
}

const VO2MAX_TIER_LABELS = ['Låg', 'Under snitt', 'Medel', 'Bra', 'Mycket bra', 'Elit']

export type Vo2maxRating = { label: string; tier: number } // tier 1–6

export function vo2maxRating(
  value: number,
  birthYear: number | null | undefined,
  biologicalSex: 'male' | 'female' | null | undefined,
  now = new Date(),
): Vo2maxRating | null {
  if (!birthYear || !biologicalSex) return null
  const age = now.getFullYear() - birthYear
  const table = VO2MAX_NORMS[biologicalSex]
  const bracket = table.find(b => age <= b.maxAge) ?? table[table.length - 1]
  const tierIndex = bracket.bounds.findIndex(bound => value < bound)
  const tier = tierIndex === -1 ? bracket.bounds.length : tierIndex
  return { label: VO2MAX_TIER_LABELS[tier], tier: tier + 1 }
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
