import { describe, it, expect } from 'vitest'
import { measurePace, buildForecast, suggestLowerMilestone, addDaysKey, type WeighIn } from './weight-forecast'

const TODAY = '2026-10-04'
// Jämn nedgång: kgPerWeek, en vägning var 3:e dag, n vägningar bakåt från idag
function series(startKg: number, kgPerWeek: number, n = 12, stepDays = 3): WeighIn[] {
  return Array.from({ length: n }, (_, i) => {
    const back = (n - 1 - i) * stepDays
    return { date: addDaysKey(TODAY, -back), weightKg: Math.round((startKg + (kgPerWeek / 7) * back) * 10) / 10 }
  })
}

describe('measurePace', () => {
  it('räknar takten från jämn nedgång', () => {
    const p = measurePace(series(90, 0.5), TODAY) // idag = 90, för 33 dagar sedan ≈ 92,4
    expect(p.lossKgPerDay! * 7).toBeCloseTo(0.5, 1)
    expect(p.fittedTodayKg).toBeCloseTo(90, 0)
  })
  it('kräver tillräckligt många vägningar och tillräcklig spännvidd', () => {
    expect(measurePace(series(90, 0.5, 3), TODAY).reason).toBe('too_few')
    expect(measurePace(series(90, 0.5, 5, 2), TODAY).reason).toBe('too_short') // 8 dagars spann
  })
  it('ger ingen takt när vikten inte går ner', () => {
    expect(measurePace(series(90, 0, 10), TODAY).reason).toBe('not_losing')
    expect(measurePace(series(90, -0.4, 10), TODAY).reason).toBe('not_losing') // går upp
  })
  it('ignorerar vägningar äldre än 6 veckor', () => {
    const old: WeighIn[] = [{ date: addDaysKey(TODAY, -80), weightKg: 120 }]
    const p = measurePace([...old, ...series(90, 0.5)], TODAY)
    expect(p.lossKgPerDay! * 7).toBeCloseTo(0.5, 1)
  })
})

describe('buildForecast', () => {
  const pace = measurePace(series(90, 0.5), TODAY)
  it('ger ett spann: snabbast ≤ huvud ≤ försiktigast i vikt, och går aldrig under golvet', () => {
    const f = buildForecast(pace, TODAY, 85)!
    const later = f.weightOn(addDaysKey(TODAY, 60))
    expect(later.fastest).toBeLessThanOrEqual(later.main)
    expect(later.main).toBeLessThanOrEqual(later.slowest)
    const far = f.weightOn(addDaysKey(TODAY, 300))
    expect(far.fastest).toBe(85)
    expect(Math.min(...f.points.map(p => p.fastest))).toBeGreaterThanOrEqual(85)
  })
  it('når en vikt tidigast med snabb linje och senast med försiktig', () => {
    const r = buildForecast(pace, TODAY, 80)!.reach(88)
    expect(r.fastest! <= r.main!).toBe(true)
    expect(r.main! <= r.slowest!).toBe(true)
  })
  it('ger null utan en uppmätt takt', () => {
    expect(buildForecast(measurePace(series(90, 0, 10), TODAY), TODAY, 80)).toBeNull()
  })
})

describe('suggestLowerMilestone', () => {
  it('föreslår lägre delmål när huvudlinjen ligger klart före, avrundat nedåt och med samma datum', () => {
    const f = buildForecast(measurePace(series(90, 0.7), TODAY), TODAY, 80)!
    const date = addDaysKey(TODAY, 42)
    const s = suggestLowerMilestone(f, { targetKg: 89, targetDateISO: date }, 80, TODAY)!
    expect(s.newTargetKg).toBeLessThanOrEqual(88)
    expect(s.newTargetKg % 0.5).toBe(0)
    expect(s.targetDateISO).toBe(date)
  })
  it('föreslår inget när man ligger i fas, nära datumet eller saknar underlag', () => {
    const f = buildForecast(measurePace(series(90, 0.5), TODAY), TODAY, 80)!
    expect(suggestLowerMilestone(f, { targetKg: 87.5, targetDateISO: addDaysKey(TODAY, 42) }, 80, TODAY)).toBeNull() // huvudlinjen ≈ 87,4 → 87: bara 0,5 lägre
    expect(suggestLowerMilestone(f, { targetKg: 89, targetDateISO: addDaysKey(TODAY, 3) }, 80, TODAY)).toBeNull()
    expect(suggestLowerMilestone(null, { targetKg: 89, targetDateISO: addDaysKey(TODAY, 42) }, 80, TODAY)).toBeNull()
  })
  it('går aldrig under slutmålet', () => {
    const f = buildForecast(measurePace(series(90, 1.5), TODAY), TODAY, 85)!
    const s = suggestLowerMilestone(f, { targetKg: 89, targetDateISO: addDaysKey(TODAY, 90) }, 85, TODAY)!
    expect(s.newTargetKg).toBeGreaterThanOrEqual(85)
  })
})
