// Pure computation for the "Kost denna vecka" section of Veckans Recap —
// same no-AI/no-I/O contract as weekly-digest.ts, just for nutrition
// instead of training. Covers BOTH data sources a user might have: YAZIO's
// synced history (richer — weight/water/fasting included) and the app's
// own manual Kost logging (lib/kost.ts). A user gets whichever source
// actually has rows this week; if neither does, the section is skipped
// entirely rather than showing a wall of dashes (Daniel: "allt spännande
// ska med" — an empty section isn't spännande, it's just noise).
import type { YazioDay } from './yazio-history'
import { mealLabel as yazioMealLabel } from './yazio-history'
import { KOST_MEALS, computeDayCompleteness, kcalTotalForDay, metricTotalForDay, kostMealLabel, type KostMeal, type KostFoodEntry } from './kost'

export type WeeklyKostSource = 'yazio' | 'manual' | 'none'

export type WeeklyKostData = {
  source: WeeklyKostSource
  daysWithData: number // out of 7
  daysFlagged: number // past days this week with no/incomplete logging
  avgKcal: number | null
  kcalGoal: number | null
  daysWithinKcalGoal: number | null // among daysWithData
  prevWeekAvgKcal: number | null // for a one-line trend, not a full second week of stats
  avgProteinG: number | null
  proteinGoalG: number | null
  avgCarbG: number | null
  carbGoalG: number | null
  avgFatG: number | null
  fatGoalG: number | null
  weightStartKg: number | null // YAZIO only — manual Kost doesn't track weight
  weightEndKg: number | null
  avgWaterMl: number | null // YAZIO only
  waterGoalMl: number | null
  mostSkippedMeal: string | null // the meal label missed most often this week, or null if logging was consistent
}

// Monday..Sunday ISO date keys for the week starting at `weekStart` —
// shared by both branches below so "this week" always means the same 7
// calendar days regardless of which source is being read.
export function weekDateKeys(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function avg(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null)
  return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null
}

function computeFromYazio(days: string[], history: YazioDay[], todayKey: string): WeeklyKostData {
  const byDate = new Map(history.map(d => [d.date, d]))
  const weekDays = days.map(k => byDate.get(k) ?? null)
  const loggedDays = weekDays.filter((d): d is YazioDay => !!d && d.kcalEaten != null)
  const pastDays = days.filter(k => k <= todayKey)
  const daysFlagged = pastDays.filter(k => {
    const d = byDate.get(k)
    return !d || d.kcalEaten == null
  }).length

  // Which meal slot has the fewest logged entries among days that DID log
  // something — a day with zero data everywhere shouldn't count as "always
  // skips lunch", it just didn't happen. YAZIO's API always returns a
  // present meal object even when nothing was eaten (kcal: 0), it never
  // omits the key or nulls it — confirmed against a real account's stored
  // history, where every unlogged meal came back as {kcal: 0, ...} — so
  // "missed" has to mean falsy/zero kcal, not null (checking only null
  // silently never flagged anything, a real bug caught before shipping).
  const mealKeys = ['breakfast', 'lunch', 'dinner', 'snack'] as const
  let mostSkipped: string | null = null
  if (loggedDays.length >= 3) {
    const missCounts = mealKeys.map(m => ({
      m,
      misses: loggedDays.filter(d => !d.meals[m]?.kcal).length,
    }))
    const worst = missCounts.reduce((a, b) => (b.misses > a.misses ? b : a))
    if (worst.misses >= Math.ceil(loggedDays.length * 0.6)) mostSkipped = yazioMealLabel(worst.m)
  }

  const weights = loggedDays.map(d => d.weightKg).filter((w): w is number => w != null)

  return {
    source: 'yazio',
    daysWithData: loggedDays.length,
    daysFlagged,
    avgKcal: avg(loggedDays.map(d => d.kcalEaten)),
    kcalGoal: loggedDays.find(d => d.kcalGoal != null)?.kcalGoal ?? null,
    daysWithinKcalGoal: (() => {
      const withGoal = loggedDays.filter(d => d.kcalGoal != null)
      return withGoal.length ? withGoal.filter(d => (d.kcalEaten ?? 0) <= d.kcalGoal!).length : null
    })(),
    prevWeekAvgKcal: null, // filled in by the caller, which has the prev week's own YazioDay slice
    avgProteinG: avg(loggedDays.map(d => d.proteinG)),
    proteinGoalG: loggedDays.find(d => d.proteinGoalG != null)?.proteinGoalG ?? null,
    avgCarbG: avg(loggedDays.map(d => d.carbG)),
    carbGoalG: null, // YAZIO doesn't expose a separate carb goal
    avgFatG: avg(loggedDays.map(d => d.fatG)),
    fatGoalG: null,
    weightStartKg: weights[0] ?? null,
    weightEndKg: weights.length ? weights[weights.length - 1] : null,
    avgWaterMl: avg(loggedDays.map(d => d.waterMl)),
    waterGoalMl: loggedDays.find(d => d.waterGoalMl != null)?.waterGoalMl ?? null,
    mostSkippedMeal: mostSkipped,
  }
}

function computeFromManual(
  days: string[],
  entriesByDate: Map<string, KostFoodEntry[]>,
  todayKey: string,
  trackedMeals: KostMeal[],
  dayOverrides: Set<string>,
  calorieGoal: number | null,
  proteinGoalG: number | null,
  carbGoalG: number | null,
  fatGoalG: number | null,
): WeeklyKostData {
  const pastDays = days.filter(k => k <= todayKey)
  const dayInfos = pastDays.map(k => {
    const entries = entriesByDate.get(k) ?? []
    const completeness = computeDayCompleteness(trackedMeals, entries, dayOverrides.has(k))
    return { key: k, entries, completeness }
  })
  const loggedDays = dayInfos.filter(d => d.entries.length > 0)
  const daysFlagged = dayInfos.filter(d => d.completeness.status === 'no_data' || d.completeness.status === 'incomplete').length

  const missingCounts = new Map<KostMeal, number>()
  for (const d of dayInfos) {
    if (d.completeness.status === 'incomplete') {
      for (const m of d.completeness.missingMeals) missingCounts.set(m, (missingCounts.get(m) ?? 0) + 1)
    }
  }
  // Denominator is loggedDays (days something was actually logged), not
  // dayInfos (which also includes pure no_data days) — a week with 4 empty
  // days and 3 days consistently missing dinner should still surface
  // "skips dinner", not get diluted into silence by the empty days.
  let mostSkipped: string | null = null
  if (loggedDays.length >= 3 && missingCounts.size > 0) {
    const [worstMeal, worstCount] = [...missingCounts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))
    if (worstCount >= Math.ceil(loggedDays.length * 0.5)) mostSkipped = kostMealLabel(worstMeal)
  }

  const kcalPerDay = loggedDays.map(d => kcalTotalForDay(d.entries))
  const proteinPerDay = loggedDays.map(d => metricTotalForDay(d.entries, 'protein'))
  const carbPerDay = loggedDays.map(d => metricTotalForDay(d.entries, 'carb'))
  const fatPerDay = loggedDays.map(d => metricTotalForDay(d.entries, 'fat'))

  return {
    source: 'manual',
    daysWithData: loggedDays.length,
    daysFlagged,
    avgKcal: kcalPerDay.length ? avg(kcalPerDay) : null,
    kcalGoal: calorieGoal,
    daysWithinKcalGoal: calorieGoal != null && kcalPerDay.length ? kcalPerDay.filter(k => k <= calorieGoal).length : null,
    prevWeekAvgKcal: null,
    avgProteinG: proteinPerDay.some(p => p > 0) ? avg(proteinPerDay) : null,
    proteinGoalG,
    avgCarbG: carbPerDay.some(c => c > 0) ? avg(carbPerDay) : null,
    carbGoalG,
    avgFatG: fatPerDay.some(f => f > 0) ? avg(fatPerDay) : null,
    fatGoalG,
    weightStartKg: null,
    weightEndKg: null,
    avgWaterMl: null,
    waterGoalMl: null,
    mostSkippedMeal: mostSkipped,
  }
}

export function computeWeeklyKost({
  weekStart,
  prevWeekStart,
  todayKey,
  yazioHistory,
  manualEntries,
  trackedMeals,
  dayOverrides,
  calorieGoal,
  proteinGoalG,
  carbGoalG,
  fatGoalG,
}: {
  weekStart: Date
  prevWeekStart: Date
  todayKey: string // stockholmDateKey() of "now" — flags only count past days, never future ones
  yazioHistory: YazioDay[] // full history, same shape the Kost page already fetches
  manualEntries: KostFoodEntry[] // this week's + prev week's manual food_log rows (meal, protein_g, carb_g, fat_g, logged_at)
  trackedMeals: KostMeal[] // profiles.kost_tracked_meals (or the default if tracking's off — still meaningful for "how consistently did they log")
  dayOverrides: Set<string> // dates with kost_day_status = 'complete'
  calorieGoal: number | null
  proteinGoalG: number | null
  carbGoalG: number | null
  fatGoalG: number | null
}): WeeklyKostData | null {
  const days = weekDateKeys(weekStart)
  const prevDays = weekDateKeys(prevWeekStart)

  const hasYazioThisWeek = yazioHistory.some(d => days.includes(d.date) && d.kcalEaten != null)
  const hasManualThisWeek = manualEntries.some(e => days.includes(e.logged_at.slice(0, 10)))

  if (!hasYazioThisWeek && !hasManualThisWeek) return null

  if (hasYazioThisWeek) {
    const result = computeFromYazio(days, yazioHistory, todayKey)
    const prevLogged = yazioHistory.filter(d => prevDays.includes(d.date) && d.kcalEaten != null)
    result.prevWeekAvgKcal = avg(prevLogged.map(d => d.kcalEaten))
    return result
  }

  const entriesByDate = new Map<string, KostFoodEntry[]>()
  for (const e of manualEntries) {
    const key = e.logged_at.slice(0, 10)
    if (!entriesByDate.has(key)) entriesByDate.set(key, [])
    entriesByDate.get(key)!.push(e)
  }
  const result = computeFromManual(days, entriesByDate, todayKey, trackedMeals.length ? trackedMeals : KOST_MEALS, dayOverrides, calorieGoal, proteinGoalG, carbGoalG, fatGoalG)
  const prevDaysWithData = prevDays.filter(k => (entriesByDate.get(k) ?? []).length > 0)
  const prevKcal = prevDaysWithData.map(k => kcalTotalForDay(entriesByDate.get(k) ?? []))
  result.prevWeekAvgKcal = prevKcal.length ? avg(prevKcal) : null
  return result
}
