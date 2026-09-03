// Flags a single day's logging as "worth a second look" — pure rules, no
// AI, no I/O. Same no-AI/no-I/O contract as kost.ts/deficit.ts. Daniel's
// own case: three casein portions logged but only 112g protein total,
// because the main meals were carb/fat-led rather than protein-led — each
// entry looked fine on its own, the day as a whole didn't add up.
import type { KostFoodEntry } from './kost'

export type DayFlag =
  | { kind: 'low_protein_despite_sources'; proteinG: number; goalG: number; proteinSourceCount: number }
  | { kind: 'kcal_far_below_baseline'; eatenKcal: number; baselineKcal: number; pctBelow: number }
  | { kind: 'high_kcal_low_protein'; eatenKcal: number; proteinG: number }

// A day must have at least this many manually-logged entries with a real
// protein density before "low protein despite sources" can fire — one
// black-coffee entry logged alongside a carb-heavy meal isn't "sources".
const MIN_PROTEIN_SOURCES = 2
// g of protein per 100 kcal — roughly a lean-meat/dairy/protein-powder
// density. Below this an entry just isn't a meaningful protein source.
const PROTEIN_SOURCE_DENSITY_PER_100KCAL = 15
const LOW_PROTEIN_RATIO = 0.8
const BASELINE_LOW_RATIO = 0.7
const BASELINE_LOW_ABSOLUTE_MARGIN_KCAL = 500
const MIN_BASELINE_DAYS = 10
const HIGH_KCAL_LOW_PROTEIN_RATIO = 0.05 // g protein per kcal eaten (under 100g at 2000kcal)

export function detectDayAnomalies(input: {
  day: {
    eatenKcal: number
    proteinG: number | null
    entries: KostFoodEntry[] // manual entries only — YAZIO days don't expose per-entry macros
    isComplete: boolean
    source: 'yazio' | 'manual'
  }
  baselineAvgKcal: number | null
  baselineDaysLogged: number
  proteinGoalG: number | null
  budgetKcal: number | null
}): DayFlag[] {
  const { day, baselineAvgKcal, baselineDaysLogged, proteinGoalG, budgetKcal } = input

  // A half-logged day must never render as a warning — same stance
  // dailyDiffStatus already takes for the grey/incomplete case.
  if (!day.isComplete) return []

  const flags: DayFlag[] = []

  if (
    day.source === 'manual' &&
    proteinGoalG != null &&
    day.proteinG != null &&
    day.proteinG < LOW_PROTEIN_RATIO * proteinGoalG
  ) {
    const proteinSourceCount = day.entries.filter(e => e.calories > 0 && ((e.protein_g ?? 0) / e.calories) * 100 >= PROTEIN_SOURCE_DENSITY_PER_100KCAL).length
    if (proteinSourceCount >= MIN_PROTEIN_SOURCES) {
      flags.push({ kind: 'low_protein_despite_sources', proteinG: day.proteinG, goalG: proteinGoalG, proteinSourceCount })
    }
  }

  if (baselineAvgKcal != null && baselineDaysLogged >= MIN_BASELINE_DAYS) {
    const farBelowRelative = day.eatenKcal < BASELINE_LOW_RATIO * baselineAvgKcal
    const farBelowBudget = budgetKcal != null && day.eatenKcal < budgetKcal - BASELINE_LOW_ABSOLUTE_MARGIN_KCAL
    if (farBelowRelative && farBelowBudget) {
      flags.push({
        kind: 'kcal_far_below_baseline',
        eatenKcal: day.eatenKcal,
        baselineKcal: Math.round(baselineAvgKcal),
        pctBelow: Math.round((1 - day.eatenKcal / baselineAvgKcal) * 100),
      })
    }
  }

  if (
    baselineAvgKcal != null &&
    day.eatenKcal >= baselineAvgKcal &&
    day.proteinG != null &&
    day.eatenKcal > 0 &&
    day.proteinG / day.eatenKcal < HIGH_KCAL_LOW_PROTEIN_RATIO
  ) {
    flags.push({ kind: 'high_kcal_low_protein', eatenKcal: day.eatenKcal, proteinG: day.proteinG })
  }

  return flags
}

// One line, highest-priority flag only — never a list. Matches the app's
// existing "one clear line, not a wall of warnings" style.
export function dayFlagLabel(flag: DayFlag): string {
  switch (flag.kind) {
    case 'low_protein_despite_sources':
      return `Lågt protein idag (${Math.round(flag.proteinG)}g) trots ${flag.proteinSourceCount} loggade proteinkällor`
    case 'kcal_far_below_baseline':
      return `Ovanligt lågt kaloriintag idag (${flag.eatenKcal} kcal, ${flag.pctBelow}% under ditt snitt) — stämmer det?`
    case 'high_kcal_low_protein':
      return `${flag.eatenKcal} kcal idag men bara ${Math.round(flag.proteinG)}g protein — övervägt att prioritera protein?`
  }
}
