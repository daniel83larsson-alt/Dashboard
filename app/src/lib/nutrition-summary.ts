// Shared "how has this person actually been eating" summary — one no-AI/
// no-I/O computation feeding three different AI surfaces (the Nutritionist
// coach persona, Insikter's Kost-specialist, and the Kost page's own
// review card) instead of three near-identical rebuilds of the same
// week/general numbers. Two windows: this calendar week (delegates to
// weekly-kost.ts — same numbers Veckans Recap already shows, so the two
// never quietly disagree) and a rolling GENERAL_WINDOW_DAYS window for a
// broader "allmänt" picture, per Daniel's request to weigh in
// training/Viktmål too, not just raw kcal.
import { startOfWeek } from './dates'
import { computeWeeklyKost, type WeeklyKostData } from './weekly-kost'
import { resolveDayNutrition } from './day-nutrition-source'
import { compute7DayAverage } from './deficit'
import type { KostFoodEntry, KostMeal } from './kost'
import type { YazioDay } from './yazio-history'

export const GENERAL_WINDOW_DAYS = 30

export type NutritionSummaryInput = {
  now: Date
  todayKey: string // stockholmDateKey() of `now` — keeps the day boundary in Swedish local time, matching every other Kost/Viktmål computation
  yazioHistory: YazioDay[]
  manualEntries: KostFoodEntry[] // needs to cover at least GENERAL_WINDOW_DAYS + 7 back for the "previous week" trend line
  trackedMeals: KostMeal[]
  dayOverrides: Set<string>
  calorieGoal: number | null
  proteinGoalG: number | null
  carbGoalG: number | null
  fatGoalG: number | null
  deficitEnabled: boolean
  deficitBudgetKcal: number | null
}

export type NutritionSummary = {
  hasData: boolean
  week: WeeklyKostData | null
  generalWindowDays: number
  generalDaysLogged: number
  generalAvgKcal: number | null
  generalDeficitAvgDiffKcal: number | null // 7-day avg vs Viktmål budget, only when deficit tracking is on
  weightChangeKg: number | null // over the general window — YAZIO-only, manual Kost doesn't track weight
}

function dateKeysBack(todayKey: string, days: number): string[] {
  const anchor = new Date(`${todayKey}T00:00:00`)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(anchor)
    d.setDate(d.getDate() - i)
    return d.toISOString().slice(0, 10)
  })
}

export function buildNutritionSummary(input: NutritionSummaryInput): NutritionSummary {
  const {
    now, todayKey, yazioHistory, manualEntries, trackedMeals, dayOverrides,
    calorieGoal, proteinGoalG, carbGoalG, fatGoalG, deficitEnabled, deficitBudgetKcal,
  } = input

  const weekStart = startOfWeek(now)
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)

  const week = computeWeeklyKost({
    weekStart, prevWeekStart, todayKey,
    yazioHistory, manualEntries, trackedMeals, dayOverrides,
    calorieGoal, proteinGoalG, carbGoalG, fatGoalG,
  })

  const yazioByDate = new Map(yazioHistory.map(d => [d.date, d]))
  const manualByDate = new Map<string, KostFoodEntry[]>()
  for (const e of manualEntries) {
    const key = e.logged_at.slice(0, 10)
    if (!manualByDate.has(key)) manualByDate.set(key, [])
    manualByDate.get(key)!.push(e)
  }

  const generalDays = dateKeysBack(todayKey, GENERAL_WINDOW_DAYS)
  const resolved = generalDays.map(k => resolveDayNutrition(k, yazioByDate, manualByDate, trackedMeals, dayOverrides))
  const complete = resolved.filter(d => d.isComplete)
  const generalAvgKcal = complete.length ? Math.round(complete.reduce((s, d) => s + d.eatenKcal, 0) / complete.length) : null

  let generalDeficitAvgDiffKcal: number | null = null
  if (deficitEnabled && deficitBudgetKcal != null) {
    // Most recent 7 of the general window — same rolling-average math the
    // Viktmål page and its Översikt card already use, just recomputed here
    // from the same resolved days instead of a fourth ad-hoc merge.
    generalDeficitAvgDiffKcal = compute7DayAverage(resolved.slice(0, 7), deficitBudgetKcal).avgDiffKcal
  }

  const weightPoints = yazioHistory
    .filter(d => generalDays.includes(d.date) && d.weightKg != null)
    .sort((a, b) => a.date < b.date ? -1 : 1)
  const weightChangeKg = weightPoints.length >= 2
    ? Math.round((weightPoints[weightPoints.length - 1].weightKg! - weightPoints[0].weightKg!) * 10) / 10
    : null

  return {
    hasData: week != null || complete.length > 0,
    week,
    generalWindowDays: GENERAL_WINDOW_DAYS,
    generalDaysLogged: complete.length,
    generalAvgKcal,
    generalDeficitAvgDiffKcal,
    weightChangeKg,
  }
}

// Compact text block for AI prompt injection — shared by the Nutritionist
// coach and the Insikter Kost-specialist so the same numbers never drift
// into two differently-worded data blocks.
export function formatNutritionForPrompt(s: NutritionSummary): string {
  if (!s.hasData) return 'Ingen kostloggning hittad ännu — varken manuell Kost-loggning eller YAZIO.'

  const lines: string[] = []
  if (s.week) {
    const w = s.week
    lines.push(
      `DENNA VECKA: ${w.daysWithData}/7 dagar loggade` +
      (w.avgKcal != null ? `, snitt ${w.avgKcal} kcal${w.kcalGoal != null ? ` (mål ${w.kcalGoal})` : ''}` : '') +
      (w.avgProteinG != null ? `, protein ${Math.round(w.avgProteinG)}g${w.proteinGoalG != null ? `/${Math.round(w.proteinGoalG)}g` : ''}` : '') +
      (w.mostSkippedMeal ? `, missar oftast ${w.mostSkippedMeal}` : '')
    )
  } else {
    lines.push('DENNA VECKA: ingen loggning än.')
  }

  lines.push(
    `SENASTE ${s.generalWindowDays} DAGARNA: ${s.generalDaysLogged}/${s.generalWindowDays} dagar loggade` +
    (s.generalAvgKcal != null ? `, snittkcal ${s.generalAvgKcal}` : '')
  )
  if (s.generalDeficitAvgDiffKcal != null) {
    const sign = s.generalDeficitAvgDiffKcal > 0 ? '+' : ''
    lines.push(`VIKTMÅL: snitt ${sign}${s.generalDeficitAvgDiffKcal} kcal/dag mot budgeten senaste veckan`)
  }
  if (s.weightChangeKg != null) {
    const sign = s.weightChangeKg > 0 ? '+' : ''
    lines.push(`VIKTFÖRÄNDRING (${s.generalWindowDays} dagar, YAZIO): ${sign}${s.weightChangeKg} kg`)
  }
  return lines.join('\n')
}
