import { DEFAULT_WEIGHT_KG } from './calories'

// Same "fall back to a labeled population-average default" spirit as
// DEFAULT_WEIGHT_KG — the calorie card should never be blocked just because
// someone hasn't filled in Profil yet, but the UI must say "uppskattning"
// whenever any of these were used.
export const DEFAULT_HEIGHT_CM = 175
export const DEFAULT_AGE = 40
// Midpoint of Mifflin-St Jeor's sex constants (+5 man, -161 kvinna) — an
// honest population average rather than guessing a sex when none is given.
const DEFAULT_SEX_TERM = -78

export type BiologicalSex = 'male' | 'female'

export type BmrInput = {
  weightKg: number | null | undefined
  heightCm: number | null | undefined
  birthYear: number | null | undefined
  biologicalSex: BiologicalSex | null | undefined
}

export type BmrResult = {
  bmr: number
  usedDefaults: Array<'weight' | 'height' | 'age' | 'sex'>
}

// Mifflin-St Jeor — the standard resting-metabolism (BMR) formula.
export function estimateBMR(input: BmrInput, now: Date = new Date()): BmrResult {
  const usedDefaults: BmrResult['usedDefaults'] = []

  let weightKg = input.weightKg
  if (weightKg == null) { weightKg = DEFAULT_WEIGHT_KG; usedDefaults.push('weight') }

  let heightCm = input.heightCm
  if (heightCm == null) { heightCm = DEFAULT_HEIGHT_CM; usedDefaults.push('height') }

  let age: number
  if (input.birthYear == null) { age = DEFAULT_AGE; usedDefaults.push('age') }
  else age = now.getFullYear() - input.birthYear

  let sexTerm: number
  if (input.biologicalSex === 'male') sexTerm = 5
  else if (input.biologicalSex === 'female') sexTerm = -161
  else { sexTerm = DEFAULT_SEX_TERM; usedDefaults.push('sex') }

  return { bmr: Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexTerm), usedDefaults }
}
