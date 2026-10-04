// Förväntad viktkurva ("i din takt"): ren beräkning, ingen I/O.
//
// Daniels idé: när man väl kommit igång äter man mindre och rör sig mer, så det
// går ofta snabbare än måldatumet förutsätter — då vill man SE var man landar om
// man håller takten. Tre medvetna val:
//  1. Takten räknas på 4–6 veckors vägningar (minsta-kvadrat-linje), inte på två
//     veckor som den korta textprognosen i deficit.ts — vattenvikt gör två veckor
//     för brusiga.
//  2. Resultatet är ett SPANN, inte ett streck. Viktminskning brukar avta, och en
//     rak linje lovar för mycket. Mitten (huvudlinjen) räknar med 85 % av uppmätt
//     takt, övre kanten (snabbast) med 100 %, nedre (försiktigast) med 65 %.
//  3. Kaloribudgeten påverkas aldrig av kurvan. Ett förslag på lägre delmål bygger
//     på huvudlinjen (den försiktiga), aldrig på den optimistiska kanten.

const MS_PER_DAY = 86_400_000

export const FORECAST_WINDOW_DAYS = 42
export const MIN_WEIGH_INS = 4
export const MIN_SPAN_DAYS = 14
const MIN_LOSS_KG_PER_DAY = 0.01 // ~70 g/vecka — under det kan takten inte räknas som "en takt"
export const PACE_FACTORS = { fastest: 1, main: 0.85, slowest: 0.65 } as const
const HORIZON_DAYS = 365

export type WeighIn = { date: string; weightKg: number }

function toDay(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / MS_PER_DAY)
}
export function addDaysKey(dateKey: string, days: number): string {
  return new Date((toDay(dateKey) + days) * MS_PER_DAY).toISOString().slice(0, 10)
}

export type PaceResult = {
  /** Viktminskning i kg per dag (positiv = går ner), eller null om underlaget är för tunt. */
  lossKgPerDay: number | null
  /** Vikt enligt linjen idag — jämnare än senaste vägningen. */
  fittedTodayKg: number | null
  weighIns: number
  reason?: 'too_few' | 'too_short' | 'not_losing'
}

export function measurePace(weighIns: WeighIn[], todayKey: string): PaceResult {
  const from = toDay(todayKey) - (FORECAST_WINDOW_DAYS - 1)
  const pts = weighIns
    .map(w => ({ x: toDay(w.date), y: w.weightKg }))
    .filter(p => p.x >= from && p.x <= toDay(todayKey))
  if (pts.length < MIN_WEIGH_INS) return { lossKgPerDay: null, fittedTodayKg: null, weighIns: pts.length, reason: 'too_few' }
  const xs = pts.map(p => p.x)
  if (Math.max(...xs) - Math.min(...xs) < MIN_SPAN_DAYS) return { lossKgPerDay: null, fittedTodayKg: null, weighIns: pts.length, reason: 'too_short' }

  const n = pts.length
  const mx = pts.reduce((s, p) => s + p.x, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0)
  const slope = sxy / sxx // kg per dag (negativ = går ner)
  const fittedToday = my + slope * (toDay(todayKey) - mx)
  const loss = -slope
  if (loss < MIN_LOSS_KG_PER_DAY) return { lossKgPerDay: null, fittedTodayKg: Math.round(fittedToday * 10) / 10, weighIns: n, reason: 'not_losing' }
  return { lossKgPerDay: loss, fittedTodayKg: Math.round(fittedToday * 10) / 10, weighIns: n }
}

export type ForecastPoint = { dateISO: string; fastest: number; main: number; slowest: number }

export type Forecast = {
  lossKgPerWeek: number
  startKg: number
  points: ForecastPoint[]
  /** Datum då respektive linje når en vikt (null om inte inom ett år). */
  reach: (kg: number) => { fastest: string | null; main: string | null; slowest: string | null }
  weightOn: (dateISO: string) => { fastest: number; main: number; slowest: number }
}

function lineKg(startKg: number, perDay: number, days: number, floorKg: number | null): number {
  const kg = startKg - perDay * days
  return Math.round((floorKg != null ? Math.max(kg, floorKg) : kg) * 10) / 10
}

// startKg = dagens vikt enligt linjen. floorKg = slutmålet — kurvan går aldrig under det.
export function buildForecast(pace: PaceResult, todayKey: string, floorKg: number | null): Forecast | null {
  if (pace.lossKgPerDay == null || pace.fittedTodayKg == null) return null
  const rate = pace.lossKgPerDay
  const startKg = pace.fittedTodayKg
  const perDay = { fastest: rate * PACE_FACTORS.fastest, main: rate * PACE_FACTORS.main, slowest: rate * PACE_FACTORS.slowest }

  const weightOn = (dateISO: string) => {
    const d = Math.max(0, toDay(dateISO) - toDay(todayKey))
    return {
      fastest: lineKg(startKg, perDay.fastest, d, floorKg),
      main: lineKg(startKg, perDay.main, d, floorKg),
      slowest: lineKg(startKg, perDay.slowest, d, floorKg),
    }
  }
  const reachDay = (perDayRate: number, kg: number): string | null => {
    if (startKg <= kg) return todayKey
    const days = Math.ceil((startKg - kg) / perDayRate)
    return days <= HORIZON_DAYS ? addDaysKey(todayKey, days) : null
  }

  // Veckopunkter tills sista linjen (den långsammaste) nått golvet, max ett år.
  const points: ForecastPoint[] = []
  const lastDay = floorKg != null && startKg > floorKg ? Math.min(HORIZON_DAYS, Math.ceil((startKg - floorKg) / perDay.slowest)) : 56
  for (let d = 0; d <= lastDay + 6; d += 7) {
    const dateISO = addDaysKey(todayKey, d)
    points.push({ dateISO, ...weightOn(dateISO) })
  }

  return {
    lossKgPerWeek: Math.round(rate * 7 * 100) / 100,
    startKg,
    points,
    weightOn,
    reach: kg => ({ fastest: reachDay(perDay.fastest, kg), main: reachDay(perDay.main, kg), slowest: reachDay(perDay.slowest, kg) }),
  }
}

export type MilestoneSuggestion = { newTargetKg: number; oldTargetKg: number; targetDateISO: string; daysAheadMain: number }

// Förslag på lägre delmål när man ligger före. Bygger på HUVUDLINJEN (försiktig),
// avrundar nedåt till 0,5 kg, går aldrig under slutmålet, och föreslår bara när det
// blir minst 1 kg lägre och minst en vecka återstår. Användaren godkänner själv.
export function suggestLowerMilestone(
  forecast: Forecast | null,
  milestone: { targetKg: number; targetDateISO: string } | null,
  overallTargetKg: number | null,
  todayKey: string,
): MilestoneSuggestion | null {
  if (!forecast || !milestone) return null
  if (toDay(milestone.targetDateISO) - toDay(todayKey) < 7) return null
  const mainAtDate = forecast.weightOn(milestone.targetDateISO).main
  let suggested = Math.floor(mainAtDate * 2) / 2
  if (overallTargetKg != null) suggested = Math.max(suggested, overallTargetKg)
  if (suggested > milestone.targetKg - 1) return null
  const reachMain = forecast.reach(milestone.targetKg).main
  const daysAhead = reachMain ? Math.max(0, toDay(milestone.targetDateISO) - toDay(reachMain)) : 0
  return { newTargetKg: suggested, oldTargetKg: milestone.targetKg, targetDateISO: milestone.targetDateISO, daysAheadMain: daysAhead }
}
