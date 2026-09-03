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
  weekDaysElapsed: number // Monday..today (1-7) — how many days of the calendar week have actually happened, for wording "week" data without implying the remaining days are "missing"
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
  // Monday..today, so a review run mid-week doesn't present the remaining
  // (not-yet-happened) days of the calendar week as "missing data" — Daniel
  // caught this: "är de onsdag och måndag/tisdag är loggade så är det de
  // man gör review på", not the full 7 diluted by days that haven't
  // happened yet. week.daysWithData/avgKcal already only ever counted past
  // days (verified in weekly-kost.ts) — this is purely about the WORDING
  // fed to the AI, so it can't itself confuse "future" with "forgot to log".
  const weekDaysElapsed = Math.min(7, Math.floor((new Date(`${todayKey}T00:00:00`).getTime() - weekStart.getTime()) / 86400000) + 1)

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
    weekDaysElapsed,
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
    // "X av Y dagar HITTILLS" — Y is days-elapsed-in-the-week, never 7,
    // so mid-week this can never read as "missing" the days that haven't
    // happened yet (Daniel caught this: a Wednesday review should judge
    // Mon-Wed, not get compared against a still-future Thu-Sun).
    lines.push(
      `DENNA VECKA (hittills, ${s.weekDaysElapsed} av 7 dagar har hänt): ${w.daysWithData}/${s.weekDaysElapsed} dagar loggade` +
      (w.avgKcal != null ? `, snitt ${w.avgKcal} kcal${w.kcalGoal != null ? ` (mål ${w.kcalGoal})` : ''}` : '') +
      (w.avgProteinG != null ? `, protein ${Math.round(w.avgProteinG)}g${w.proteinGoalG != null ? `/${Math.round(w.proteinGoalG)}g` : ''}` : '') +
      (w.mostSkippedMeal ? `, missar oftast ${w.mostSkippedMeal}` : '') +
      ' (kommande dagar i veckan har inte hänt än — räkna dem INTE som saknad loggning)'
    )
  } else {
    lines.push(`DENNA VECKA: ingen loggning än (${s.weekDaysElapsed} av 7 dagar har hänt).`)
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
