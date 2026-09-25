// Pure computation for "Din månad" — a bigger, once-a-month recap across
// training, vikt, kost/viktmål, sömn/steg och vanor. Same no-AI/no-I/O
// contract as weekly-digest.ts/weekly-kost.ts: callers fetch the data and
// generate an AI narrative FROM this output (monthly-report-generate.ts).
// Deliberately its own small set of helpers rather than importing
// weekly-digest.ts's week-shaped ones (sessionStats/wellnessStats etc. are
// nearly identical in spirit but operate over a variable-length month
// instead of a fixed 7 days) — same "duplicate a small helper rather than
// couple two independently-evolving recaps" convention already used
// elsewhere in this codebase (see e.g. normalizeDecimalInput).
import { dedupeForStats, type ActivityRow } from './duplicates'
import { sportLabel } from './sport'
import { activityLoad } from './load'
import { newRecordsForLatest } from './records'
import type { DayWellness } from './garmin-sync'
import type { DayNutrition, DayProtein } from './day-nutrition-source'

// The most recently COMPLETED calendar month as of `now` — a report sent on
// the 1st always covers the month that just ended, same "always the most
// recently finished period, regardless of when triggered" intent as
// recapWeekStart in weekly-digest.ts. Local midnight, 1st of that month.
export function recapMonthStart(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d
}

export function monthEndExclusive(monthStart: Date): Date {
  const d = new Date(monthStart)
  d.setMonth(d.getMonth() + 1)
  return d
}

// Every calendar date in the month as "YYYY-MM-DD", oldest first — length
// varies (28-31) by design, unlike weekDateKeys' fixed 7.
export function monthDateKeys(monthStart: Date): string[] {
  const end = monthEndExclusive(monthStart)
  const keys: string[] = []
  const cursor = new Date(monthStart)
  while (cursor < end) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export function activitiesInMonth(activities: ActivityRow[], monthStart: Date): ActivityRow[] {
  const end = monthEndExclusive(monthStart)
  return dedupeForStats(activities).filter(a => {
    const t = new Date(a.start_date)
    return t >= monthStart && t < end
  })
}

export type MonthlySessionStats = {
  count: number
  totalKm: number
  totalMinutes: number
  bySport: { sport: string; label: string; count: number; km: number }[]
}

export function monthlySessionStats(activities: ActivityRow[]): MonthlySessionStats {
  const bySport = new Map<string, { count: number; km: number }>()
  let totalDistance = 0
  let totalSeconds = 0
  for (const a of activities) {
    const entry = bySport.get(a.sport_type) ?? { count: 0, km: 0 }
    entry.count++
    entry.km += (a.distance ?? 0) / 1000
    bySport.set(a.sport_type, entry)
    totalDistance += a.distance ?? 0
    totalSeconds += a.moving_time ?? 0
  }
  return {
    count: activities.length,
    totalKm: Math.round((totalDistance / 1000) * 10) / 10,
    totalMinutes: Math.round(totalSeconds / 60),
    bySport: [...bySport.entries()]
      .map(([sport, v]) => ({ sport, label: sportLabel(sport), count: v.count, km: Math.round(v.km * 10) / 10 }))
      .sort((a, b) => b.count - a.count),
  }
}

export type MonthlyWellnessStats = { avgSteps: number | null; avgSleepHours: number | null; avgRestingHR: number | null }

export function monthlyWellnessStats(history: DayWellness[], startKey: string, endKeyInclusive: string): MonthlyWellnessStats {
  const days = history.filter(d => d.date >= startKey && d.date <= endKeyInclusive)
  const avg = (key: keyof DayWellness): number | null => {
    const vals = days.map(d => d[key]).filter((v): v is number => typeof v === 'number')
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }
  return { avgSteps: avg('steps'), avgSleepHours: avg('sleepHours'), avgRestingHR: avg('restingHR') }
}

export type MonthlyBestSession = { activityId: string; sport: string; label: string; startDate: string; distanceKm: number; minutes: number } | null

// Same load formula as Översikt/Veckans Recap (lib/load.ts) — "bästa passet"
// means the same thing everywhere in the app.
export function bestSessionOfMonth(monthActs: ActivityRow[], restingHR: number | null, maxHR: number | null): MonthlyBestSession {
  if (!monthActs.length) return null
  const scored = monthActs.map(a => ({ a, load: activityLoad(a, restingHR, maxHR) }))
  const best = scored.reduce((b, c) => (c.load > b.load ? c : b))
  return {
    activityId: best.a.id,
    sport: best.a.sport_type,
    label: sportLabel(best.a.sport_type),
    startDate: best.a.start_date,
    distanceKm: Math.round((best.a.distance / 1000) * 10) / 10,
    minutes: Math.round(best.a.moving_time / 60),
  }
}

export type MonthlyNewRecord = { activityId: string; sport: string; label: string; startDate: string; records: string[] }

// Same "did this pass beat every prior one" reuse as Veckans Recap — applied
// across the whole month instead of one week, so a report for a quiet month
// with one big PR still surfaces it.
export function newRecordsInMonth(monthActs: ActivityRow[], allActsDeduped: ActivityRow[]): MonthlyNewRecord[] {
  const sorted = [...monthActs].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const out: MonthlyNewRecord[] = []
  for (const act of sorted) {
    const prior = allActsDeduped.filter(a => a.start_date < act.start_date)
    const hits = newRecordsForLatest(act, prior)
    if (hits.length) out.push({ activityId: act.id, sport: act.sport_type, label: sportLabel(act.sport_type), startDate: act.start_date, records: hits })
  }
  return out
}

export type MonthlyWeight = { startKg: number | null; endKg: number | null; changeKg: number | null; readingsCount: number }

export function monthlyWeightSummary(readings: { date: string; weightKg: number }[]): MonthlyWeight {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date))
  const startKg = sorted[0]?.weightKg ?? null
  const endKg = sorted.length ? sorted[sorted.length - 1].weightKg : null
  return {
    startKg,
    endKg,
    changeKg: startKg != null && endKg != null ? Math.round((endKg - startKg) * 10) / 10 : null,
    readingsCount: sorted.length,
  }
}

export type MonthlyHabit = { title: string; doneDays: number }

// Days-logged count per habit within the month — a simple, honest count
// rather than reusing lib/habits.ts's period/streak machinery (which is
// built around "current streak as of right now", not "how many periods
// fell inside a specific past month"). Habits with zero activity this
// month are dropped rather than shown as a discouraging "0".
export function monthlyHabitSummary(
  habits: { id: string; title: string }[],
  logs: { habit_id: string; done_date: string }[],
  monthKeys: string[],
): MonthlyHabit[] {
  const keySet = new Set(monthKeys)
  return habits
    .map(h => ({
      title: h.title,
      doneDays: new Set(logs.filter(l => l.habit_id === h.id && keySet.has(l.done_date)).map(l => l.done_date)).size,
    }))
    .filter(h => h.doneDays > 0)
    .sort((a, b) => b.doneDays - a.doneDays)
}

export type MonthlyFunFacts = { totalActiveMinutes: number; longestSessionKm: number | null; mostActiveWeekday: string | null }

const WEEKDAY_LABELS_SV = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']

// Concrete numbers for the AI to build a "kul fakta" comparison from
// (Daniel: "massa rolig skoj info") — grounded in real totals, never a
// number the model invents itself.
export function monthlyFunFacts(monthActs: ActivityRow[]): MonthlyFunFacts {
  const byWeekday = new Map<number, number>()
  let longestKm: number | null = null
  let totalMinutes = 0
  for (const a of monthActs) {
    const day = new Date(a.start_date).getDay()
    byWeekday.set(day, (byWeekday.get(day) ?? 0) + 1)
    const km = (a.distance ?? 0) / 1000
    if (longestKm == null || km > longestKm) longestKm = km
    totalMinutes += (a.moving_time ?? 0) / 60
  }
  let mostActiveWeekday: string | null = null
  if (byWeekday.size) {
    const [day] = [...byWeekday.entries()].reduce((b, c) => (c[1] > b[1] ? c : b))
    mostActiveWeekday = WEEKDAY_LABELS_SV[day]
  }
  return {
    totalActiveMinutes: Math.round(totalMinutes),
    longestSessionKm: longestKm != null ? Math.round(longestKm * 10) / 10 : null,
    mostActiveWeekday,
  }
}

export type MonthlyKostData = {
  daysWithData: number
  totalDaysInMonth: number
  avgKcal: number | null
  kcalGoal: number | null
  avgProteinG: number | null
  proteinGoalG: number | null
}

// Takes already-resolved per-day nutrition (via day-nutrition-source.ts's
// resolveDayNutrition/resolveDayProteinG, same YAZIO-wins-over-manual
// precedence used everywhere else) rather than raw YAZIO/manual rows —
// keeps this module free of the Map-building I/O-adjacent code, which
// lives in monthly-report-generate.ts instead. Returns null when nothing
// was logged all month, same "skip the section, don't show a wall of
// dashes" rule as weekly-kost.ts.
export function summarizeMonthlyKost(
  dayNutritions: (DayNutrition | null)[],
  dayProteins: (DayProtein | null)[],
  calorieGoal: number | null,
  proteinGoalG: number | null,
): MonthlyKostData | null {
  const logged = dayNutritions.filter((d): d is DayNutrition => !!d && d.isComplete)
  if (!logged.length) return null
  const kcalPerDay = logged.map(d => d.eatenKcal)
  const proteinPerDay = dayProteins.map(d => d?.proteinG).filter((p): p is number => p != null)
  const avg = (v: number[]) => v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  return {
    daysWithData: logged.length,
    totalDaysInMonth: dayNutritions.length,
    avgKcal: avg(kcalPerDay),
    kcalGoal: calorieGoal,
    avgProteinG: avg(proteinPerDay),
    proteinGoalG,
  }
}

export type MonthlyReportData = {
  monthStartISO: string
  monthEndISO: string
  monthLabel: string
  thisMonth: { sessions: MonthlySessionStats; wellness: MonthlyWellnessStats }
  prevMonth: { sessions: MonthlySessionStats; wellness: MonthlyWellnessStats }
  bestSession: MonthlyBestSession
  newRecords: MonthlyNewRecord[]
  weight: MonthlyWeight
  habits: MonthlyHabit[]
  funFacts: MonthlyFunFacts
}

const MONTH_LABELS_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']

export function computeMonthlyReport({
  monthStart,
  activities,
  wellnessHistory,
  restingHR = null,
  maxHR = null,
  weightReadings,
  habits,
  habitLogs,
}: {
  monthStart: Date
  activities: ActivityRow[] // full history — bestSession/newRecords need everything before this month
  wellnessHistory: DayWellness[]
  restingHR?: number | null
  maxHR?: number | null
  weightReadings: { date: string; weightKg: number }[]
  habits: { id: string; title: string }[]
  habitLogs: { habit_id: string; done_date: string }[]
}): MonthlyReportData {
  const end = monthEndExclusive(monthStart)
  const monthEndDisplay = new Date(end)
  monthEndDisplay.setDate(monthEndDisplay.getDate() - 1)
  const prevMonthStart = new Date(monthStart)
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
  const prevMonthEnd = new Date(monthStart)
  prevMonthEnd.setDate(prevMonthEnd.getDate() - 1)

  const monthActs = activitiesInMonth(activities, monthStart)
  const prevMonthActs = activitiesInMonth(activities, prevMonthStart)

  const monthStartKey = monthStart.toISOString().slice(0, 10)
  const monthEndKey = monthEndDisplay.toISOString().slice(0, 10)
  const prevMonthStartKey = prevMonthStart.toISOString().slice(0, 10)
  const prevMonthEndKey = prevMonthEnd.toISOString().slice(0, 10)

  const monthKeys = monthDateKeys(monthStart)
  const weightThisMonth = weightReadings.filter(r => r.date >= monthStartKey && r.date <= monthEndKey)

  return {
    monthStartISO: monthStartKey,
    monthEndISO: monthEndKey,
    monthLabel: `${MONTH_LABELS_SV[monthStart.getMonth()]} ${monthStart.getFullYear()}`,
    thisMonth: {
      sessions: monthlySessionStats(monthActs),
      wellness: monthlyWellnessStats(wellnessHistory, monthStartKey, monthEndKey),
    },
    prevMonth: {
      sessions: monthlySessionStats(prevMonthActs),
      wellness: monthlyWellnessStats(wellnessHistory, prevMonthStartKey, prevMonthEndKey),
    },
    bestSession: bestSessionOfMonth(monthActs, restingHR, maxHR),
    newRecords: newRecordsInMonth(monthActs, dedupeForStats(activities)),
    weight: monthlyWeightSummary(weightThisMonth),
    habits: monthlyHabitSummary(habits, habitLogs, monthKeys),
    funFacts: monthlyFunFacts(monthActs),
  }
}
