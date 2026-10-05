// PROTOTYP (ej inkopplad någonstans): klassning Träning vs Vardagsrörelse enligt Daniels spec
// (docs/spec-traning-vs-vardagsrorelse.md). Ren funktion, ingen I/O, inte importerad av appen —
// finns för att regler och exempel ska kunna köras och testas innan något byggs eller migreras.
// Första träff gäller; `rule` säger vilken regel som slog till.

export type Category = 'training' | 'daily_movement'

export type ClassifyInput = {
  sport: string
  durationSec: number
  avgHr: number | null
  /** Sekunder i zon 1..5 om zondata finns. */
  zoneSecs?: number[] | null
  /** Styrkepass med loggade set (set/reps i passet). */
  hasLoggedSets?: boolean
  /** Användarens eget val — slår allt annat. */
  userCategory?: Category | null
  lthr?: number | null
  hrMax?: number | null
}

export type Classification = {
  category: Category
  rule: 'user' | 'strength_sets' | 'hr_rule' | 'hr_below_threshold' | 'no_hr_short_walk_or_ride' | 'no_hr_ask_user' | 'default_daily'
  /** Passet saknar puls och är långt: be användaren välja (förvalt: vardagsrörelse). */
  askUser?: boolean
  /** Förslag att visa knappen "Märk som pendling" (kräver bekräftelse). */
  suggestTag?: 'Pendling'
  note?: string
}

const ENDURANCE = new Set(['Rowing', 'Run', 'TrailRun', 'Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'])
const STRENGTH = new Set(['WeightTraining', 'Kettlebell', 'Crossfit', 'Workout'])
const WALK_OR_RIDE = new Set(['Walk', 'Hike', 'Ride', 'VirtualRide', 'GravelRide', 'EBikeRide', 'MountainBikeRide'])

export const MIN_TRAINING_SEC = 20 * 60
export const HR_FRACTION_OF_LTHR = 0.8
export const HRMAX_FRACTION_WITHOUT_LTHR = 0.65
export const Z2_PLUS_SHARE = 0.5
export const NO_HR_WALK_RIDE_MAX_SEC = 60 * 60

export function effectiveLthr(lthr: number | null | undefined, hrMax: number | null | undefined): number | null {
  if (lthr) return lthr
  return hrMax ? hrMax * HRMAX_FRACTION_WITHOUT_LTHR : null
}

function z2PlusShare(zoneSecs: number[] | null | undefined): number | null {
  if (!zoneSecs || zoneSecs.length < 5) return null
  const total = zoneSecs.reduce((s, v) => s + v, 0)
  if (total <= 0) return null
  return (zoneSecs[1] + zoneSecs[2] + zoneSecs[3] + zoneSecs[4]) / total
}

// Intensitetsminuter: Z2–Z3 = 1 min, Z4+ = 2 min (spec).
export function intensityMinutes(zoneSecs: number[] | null | undefined): number | null {
  if (!zoneSecs || zoneSecs.length < 5) return null
  return Math.round((zoneSecs[1] + zoneSecs[2] + 2 * (zoneSecs[3] + zoneSecs[4])) / 60)
}

export function classifyActivity(a: ClassifyInput, ctx: { isWeekday?: boolean; sameStartEndOnOtherDays?: boolean } = {}): Classification {
  // 1. Användarens eget val
  if (a.userCategory) return { category: a.userCategory, rule: 'user' }

  // 2. Styrka med loggade set
  if (STRENGTH.has(a.sport) && a.hasLoggedSets) return { category: 'training', rule: 'strength_sets' }

  const hasHr = a.avgHr != null || z2PlusShare(a.zoneSecs) != null

  // 5 (före 4, annars kan den aldrig slå till — se frågor): saknas puls
  if (!hasHr) {
    if (WALK_OR_RIDE.has(a.sport) && a.durationSec < NO_HR_WALK_RIDE_MAX_SEC) {
      return { category: 'daily_movement', rule: 'no_hr_short_walk_or_ride', suggestTag: suggestCommute(a, ctx) }
    }
    if (WALK_OR_RIDE.has(a.sport)) return { category: 'daily_movement', rule: 'no_hr_ask_user', askUser: true }
  }

  // 3. Rodd/löpning/cykel med puls
  if (ENDURANCE.has(a.sport) && hasHr && a.durationSec >= MIN_TRAINING_SEC) {
    const lthr = effectiveLthr(a.lthr, a.hrMax)
    const hrOk = a.avgHr != null && lthr != null && a.avgHr >= HR_FRACTION_OF_LTHR * lthr
    const share = z2PlusShare(a.zoneSecs)
    const zoneOk = share != null && share >= Z2_PLUS_SHARE
    if (hrOk || zoneOk) return { category: 'training', rule: 'hr_rule', note: hrOk ? 'puls ≥ 80 % av LTHR' : 'minst 50 % av tiden i zon 2+' }
    return { category: 'daily_movement', rule: 'hr_below_threshold', suggestTag: suggestCommute(a, ctx) }
  }

  // 4. Annars vardagsrörelse
  return { category: 'daily_movement', rule: 'default_daily', suggestTag: suggestCommute(a, ctx) }
}

// Föreslå taggen Pendling (bekräftas med knapp): cykel/gång, under 30 min, vardag, samma start och slut flera dagar.
function suggestCommute(a: ClassifyInput, ctx: { isWeekday?: boolean; sameStartEndOnOtherDays?: boolean }): 'Pendling' | undefined {
  const rideOrWalk = WALK_OR_RIDE.has(a.sport)
  return rideOrWalk && a.durationSec < 30 * 60 && ctx.isWeekday && ctx.sameStartEndOnOtherDays ? 'Pendling' : undefined
}
