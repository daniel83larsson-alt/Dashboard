// Single source of truth for sport_type handling across the app — labels,
// icons, and unit-appropriate speed/pace formatting. Rowing's /500m split
// pace doesn't apply to cycling (km/h) or running/walking (min/km).

export const SPORT_LABELS: Record<string, string> = {
  Rowing: 'rodd',
  Run: 'löpning',
  TrailRun: 'terränglöpning',
  Ride: 'cykling',
  VirtualRide: 'inomhuscykling',
  Walk: 'promenad',
  Hike: 'vandring',
  Swim: 'simning',
  WeightTraining: 'styrketräning',
  Yoga: 'yoga',
  Elliptical: 'crosstrainer',
  Workout: 'träningspass',
  HIIT: 'HIIT',
}

export const SPORT_ICONS: Record<string, string> = {
  Rowing: '🚣', Run: '🏃', TrailRun: '🏔', Ride: '🚴', VirtualRide: '🚴',
  Walk: '🚶', Hike: '🥾', Swim: '🏊', WeightTraining: '🏋️', Workout: '💪',
  HIIT: '⚡', Yoga: '🧘', Elliptical: '⚙️',
}

export function sportLabel(sport: string): string {
  return SPORT_LABELS[sport] ?? sport
}

export function sportIcon(sport: string): string {
  return SPORT_ICONS[sport] ?? '🏅'
}

export function isCycling(sport: string): boolean {
  return sport === 'Ride' || sport === 'VirtualRide'
}

export function isRunOrWalk(sport: string): boolean {
  return sport === 'Run' || sport === 'TrailRun' || sport === 'Walk' || sport === 'Hike'
}

// Rounds to whole seconds and carries into minutes so e.g. 119.6s renders as
// "2:00" rather than "1:60".
export function fmtMinSec(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds)
  const m = Math.floor(rounded / 60)
  const s = rounded % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function fmtSpeedOrPace(sportType: string, distance: number, movingTime: number): { label: string; value: string } | null {
  if (distance <= 0 || movingTime <= 0) return null

  if (isCycling(sportType)) {
    const kmh = (distance / 1000) / (movingTime / 3600)
    return { label: 'Snitthastighet', value: `${kmh.toFixed(1)} km/h` }
  }
  if (isRunOrWalk(sportType)) {
    const secPerKm = movingTime / (distance / 1000)
    return { label: 'Snittempo', value: `${fmtMinSec(secPerKm)}/km` }
  }
  if (sportType === 'Rowing') {
    const secPer500 = (movingTime / distance) * 500
    return { label: 'Snittempo', value: `${fmtMinSec(secPer500)}/500m` }
  }
  return null
}
