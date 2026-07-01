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

export function fmtSpeedOrPace(sportType: string, distance: number, movingTime: number): { label: string; value: string } | null {
  if (distance <= 0 || movingTime <= 0) return null

  if (isCycling(sportType)) {
    const kmh = (distance / 1000) / (movingTime / 3600)
    return { label: 'Snitthastighet', value: `${kmh.toFixed(1)} km/h` }
  }
  if (isRunOrWalk(sportType)) {
    const secPerKm = movingTime / (distance / 1000)
    const m = Math.floor(secPerKm / 60)
    const s = Math.round(secPerKm % 60)
    return { label: 'Snittempo', value: `${m}:${s.toString().padStart(2, '0')}/km` }
  }
  if (sportType === 'Rowing') {
    const secPer500 = (movingTime / distance) * 500
    const m = Math.floor(secPer500 / 60)
    const s = Math.round(secPer500 % 60)
    return { label: 'Snittfart', value: `${m}:${s.toString().padStart(2, '0')}/500m` }
  }
  return null
}
