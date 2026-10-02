import { describe, it, expect } from 'vitest'
import { computeZoneCheck, zoneCheckNote, asksAboutHeartRate, formatZoneCheckForPrompt, type ZoneCheckRow } from './zone-check'

let day = 0
function pass(o: { z5Low?: number; maxHr?: number | null; secs?: number } = {}): ZoneCheckRow {
  day++
  return {
    start_date: new Date(Date.UTC(2026, 8, 1 + day)).toISOString(),
    moving_time: o.secs ?? 1800,
    max_heartrate: o.maxHr === undefined ? 150 : o.maxHr,
    hr_zones: [1, 2, 3, 4, 5].map(n => ({ zoneNumber: n, secsInZone: 60, zoneLowBoundary: n === 5 ? (o.z5Low ?? 160) : 80 + n * 10 })),
  }
}
const many = (n: number, o = {}) => Array.from({ length: n }, () => pass(o))

describe('computeZoneCheck', () => {
  it('returns null with too little zone data', () => {
    expect(computeZoneCheck(many(4))).toBeNull()
    expect(computeZoneCheck([{ start_date: '2026-09-01T00:00:00Z' }])).toBeNull()
  })
  it('estimates max HR from zone 5 floor (90 %) and reports observed max', () => {
    const c = computeZoneCheck([...many(5, { maxHr: 150 }), pass({ maxHr: 172 })])!
    expect(c.estMaxHr).toBe(178)
    expect(c.observedMaxHr).toBe(172)
    expect(c.findings).toEqual([])
  })
  it('flags max too low when HR exceeds the zones\' max in at least two passes', () => {
    const c = computeZoneCheck([...many(4), pass({ maxHr: 190 }), pass({ maxHr: 188 })])!
    expect(c.findings.map(f => f.code)).toContain('max_too_low')
    expect(c.findings.find(f => f.code === 'max_too_low')!.text).toContain('2 av 6 pass')
  })
  it('does not flag a single exceedance or a tiny one', () => {
    expect(computeZoneCheck([...many(5), pass({ maxHr: 195 })])!.findings).toEqual([])
    expect(computeZoneCheck([...many(4), pass({ maxHr: 182 }), pass({ maxHr: 183 })])!.findings).toEqual([]) // 178 + 5 = 183 not exceeded
  })
  it('ignores implausible HR spikes', () => {
    const c = computeZoneCheck([...many(4), pass({ maxHr: 250 }), pass({ maxHr: 240 })])!
    expect(c.findings.find(f => f.code === 'max_too_low')).toBeUndefined()
    expect(c.observedMaxHr).toBe(150)
  })
  it('flags max too high only with many real passes that never reached zone 5', () => {
    expect(computeZoneCheck(many(8, { maxHr: 150 }))!.findings.map(f => f.code)).toContain('max_too_high')
    expect(computeZoneCheck(many(7, { maxHr: 150 }))!.findings.map(f => f.code)).not.toContain('max_too_high')
    expect(computeZoneCheck(many(8, { maxHr: 150, secs: 600 }))!.findings.map(f => f.code)).not.toContain('max_too_high')
  })
  it('flags changed zone limits across the period', () => {
    const c = computeZoneCheck([...many(3, { z5Low: 150 }), ...many(3, { z5Low: 160 })])!
    expect(c.findings.map(f => f.code)).toContain('zones_changed')
    expect(c.estMaxHr).toBe(178) // latest pass decides
  })
})

describe('asksAboutHeartRate / prompt', () => {
  it('detects pulse/zone questions in Swedish', () => {
    for (const m of ['Är mina pulszoner rätt?', 'Hur ligger min puls?', 'maxpuls?', 'Vilka zoner körde jag i', 'min HR verkar hög']) expect(asksAboutHeartRate(m)).toBe(true)
    expect(asksAboutHeartRate('Vad ska jag äta till frukost?')).toBe(false)
  })
  it('always includes the safety warning and says it is not a verdict', () => {
    const text = formatZoneCheckForPrompt(computeZoneCheck(many(5))!)
    expect(text).toContain('mycket ansträngande')
    expect(text).toContain('rimlighetskontroll')
    expect(text).toContain('Inget tyder på')
  })
})

describe('zoneCheckNote', () => {
  it('shows only the max-HR findings, never just "zones changed"', () => {
    const changedOnly = computeZoneCheck([...many(3, { z5Low: 150, maxHr: 165 }), ...many(3, { z5Low: 160, maxHr: 165 })])!
    expect(changedOnly.findings.map(f => f.code)).toEqual(['zones_changed'])
    expect(zoneCheckNote(changedOnly)).toBeNull()
    const tooLow = computeZoneCheck([...many(4), pass({ maxHr: 190 }), pass({ maxHr: 188 })])!
    expect(zoneCheckNote(tooLow)!.tip).toContain('mycket ansträngande')
    expect(zoneCheckNote(null)).toBeNull()
  })
})
