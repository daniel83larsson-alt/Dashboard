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

// Lugna pass: tid per zon [z1..z5] i sekunder, zongränser z2=125, z3=142, z5=160.
function easyPass(zs: [number, number, number, number, number], o: { secs?: number; avg?: number } = {}): ZoneCheckRow {
  day++
  return {
    start_date: new Date(Date.UTC(2026, 8, 1 + day)).toISOString(),
    moving_time: o.secs ?? zs.reduce((a, b) => a + b, 0),
    max_heartrate: 150,
    average_heartrate: o.avg ?? 130,
    hr_zones: zs.map((t, i) => ({ zoneNumber: i + 1, secsInZone: t, zoneLowBoundary: [89, 125, 142, 150, 160][i] })),
  }
}
const easyMany = (n: number, zs: [number, number, number, number, number]) => Array.from({ length: n }, () => easyPass(zs))

describe('low zones (zon 2)', () => {
  it('reports the typical split on easy passes and the zone 2 range', () => {
    const c = computeZoneCheck(easyMany(6, [300, 1200, 300, 0, 0]))!
    expect(c.lowZones).toMatchObject({ easyPasses: 6, z1Pct: 17, z2Pct: 67, z3PlusPct: 17, z2Range: [125, 141] })
    expect(c.findings.map(f => f.code)).not.toContain('z2_drift')
  })
  it('flags drift when easy passes spend a lot of time in zone 3+', () => {
    const c = computeZoneCheck(easyMany(6, [200, 600, 900, 100, 0]))!
    expect(c.findings.map(f => f.code)).toContain('z2_drift')
    expect(c.findings.find(f => f.code === 'z2_drift')!.text).toContain('zon 2 = 125–141')
  })
  it('flags "below zone 2" when easy passes sit mostly in zone 1', () => {
    const c = computeZoneCheck(easyMany(6, [1500, 200, 100, 0, 0]))!
    expect(c.findings.map(f => f.code)).toContain('z2_below')
  })
  it('does not count hard or short passes as easy, and needs at least 5 easy passes', () => {
    const hard = Array.from({ length: 6 }, () => easyPass([200, 300, 400, 600, 300])) // 50 % in zone 4–5
    expect(computeZoneCheck(hard)!.lowZones).toBeNull()
    expect(computeZoneCheck(easyMany(4, [300, 1200, 300, 0, 0]))).toBeNull() // <5 passes at all
    const short = Array.from({ length: 6 }, () => easyPass([60, 200, 100, 0, 0])) // 6 min
    expect(computeZoneCheck(short)!.lowZones).toBeNull()
  })
  it('surfaces low-zone findings in the recap note and in the coach prompt', () => {
    const c = computeZoneCheck(easyMany(6, [200, 600, 900, 100, 0]))!
    expect(zoneCheckNote(c)!.text).toContain('lugna pass')
    const prompt = formatZoneCheckForPrompt(c)
    expect(prompt).toContain('LÅGA ZONER')
    expect(prompt).toContain('pratprov')
  })
  it('recognises L2/Z2 wording as a pulse question', () => {
    expect(asksAboutHeartRate('kör jag verkligen L2?')).toBe(true)
    expect(asksAboutHeartRate('är z2 rätt för mig')).toBe(true)
  })
})

describe('low zones after a zone change', () => {
  const withZones = (zs: [number, number, number, number, number], z2: number, z3: number): ZoneCheckRow => {
    const r = easyPass(zs)
    r.hr_zones = zs.map((t, i) => ({ zoneNumber: i + 1, secsInZone: t, zoneLowBoundary: [89, z2, z3, 142, 160][i] }))
    return r
  }
  it('ignores passes measured against the old zone limits', () => {
    // 8 old-zone passes that look "drifty", then 2 new-zone passes: not enough to judge yet.
    const old = Array.from({ length: 8 }, () => withZones([200, 600, 900, 100, 0], 107, 125))
    const fresh = Array.from({ length: 2 }, () => withZones([200, 1200, 200, 0, 0], 120, 134))
    const c = computeZoneCheck([...old, ...fresh])!
    expect(c.lowZones).toBeNull()
    expect(c.findings.map(f => f.code)).not.toContain('z2_drift')
    expect(formatZoneCheckForPrompt(c)).not.toContain('LÅGA ZONER (')
  })
  it('judges once there are enough passes with the new zones, using the new zone 2 range', () => {
    const old = Array.from({ length: 8 }, () => withZones([200, 600, 900, 100, 0], 107, 125))
    const fresh = Array.from({ length: 5 }, () => withZones([200, 1200, 200, 0, 0], 120, 134))
    const c = computeZoneCheck([...old, ...fresh])!
    expect(c.lowZones).toMatchObject({ easyPasses: 5, z2Range: [120, 133] })
    expect(c.findings.map(f => f.code)).not.toContain('z2_drift')
  })
  it('tells the coach to wait when zones just changed', () => {
    const old = Array.from({ length: 8 }, () => withZones([200, 600, 900, 100, 0], 107, 125))
    const fresh = Array.from({ length: 2 }, () => withZones([200, 1200, 200, 0, 0], 120, 134))
    expect(formatZoneCheckForPrompt(computeZoneCheck([...old, ...fresh])!)).toContain('ändrades nyligen')
  })
})
