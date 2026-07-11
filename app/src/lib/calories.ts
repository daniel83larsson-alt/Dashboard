// MET (Metabolic Equivalent of Task) values per sport, used to estimate
// calories burned for manually logged passes. Flat per-sport values rather
// than pace-scaled — a reasonable ballpark, not a lab measurement, same
// spirit as every consumer fitness app's "estimated calories".
// Source: rounded from the Compendium of Physical Activities' moderate-effort
// entries for each activity.
const MET_BY_SPORT: Record<string, number> = {
  Run: 9.8,
  TrailRun: 10.5,
  Ride: 7.5,
  VirtualRide: 7,
  Walk: 3.8,
  Hike: 6,
  Swim: 8,
  Rowing: 7,
  WeightTraining: 5,
  Yoga: 3,
  Elliptical: 5.5,
  Workout: 6,
  HIIT: 8.5,
  Mobility: 2.5,
  NordicSki: 9,
  AlpineSki: 6,
}

// Used only as a fallback when the user hasn't entered their weight in
// Profil — a rough population-average adult weight, not a real estimate.
export const DEFAULT_WEIGHT_KG = 75

export function metForSport(sportType: string): number {
  return MET_BY_SPORT[sportType] ?? 6
}

// Standard ACSM formula: kcal/min = (MET × 3.5 × kg) / 200
export function estimateCalories(sportType: string, movingTimeSeconds: number, weightKg: number): number {
  const met = metForSport(sportType)
  const minutes = movingTimeSeconds / 60
  const kcalPerMin = (met * 3.5 * weightKg) / 200
  return Math.round(kcalPerMin * minutes)
}
