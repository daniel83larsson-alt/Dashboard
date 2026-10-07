import { describe, it, expect } from 'vitest'
import { mergeActivityDetails } from './overview-activities'
import { dedupeForStats } from './duplicates'

type Row = { id: string; strava_id: number; start_date: string; distance: number; moving_time: number; sport_type: string; source: string; name?: string; description?: string; hr_zones?: unknown }
const base = (id: string, start: string, extra: Partial<Row> = {}): Row => ({
  id, strava_id: Number(id.replace(/\D/g, '')) || 1, start_date: start, distance: 5000, moving_time: 1800, sport_type: 'Run', source: 'garmin', ...extra,
})

describe('mergeActivityDetails', () => {
  it('lägger detaljer på rätt rad och lämnar övriga orörda', () => {
    const out = mergeActivityDetails([base('a1', '2026-10-01T08:00:00Z'), base('a2', '2026-09-01T08:00:00Z')], [{ id: 'a1', name: 'Löpning', hr_zones: [1] } as { id: string; name: string; hr_zones: number[] }])
    expect(out[0]).toMatchObject({ id: 'a1', name: 'Löpning', hr_zones: [1] })
    expect(out[1]).not.toHaveProperty('name')
  })
  it('slår ihop flera detaljmängder för samma id', () => {
    const out = mergeActivityDetails([base('a1', '2026-10-01T08:00:00Z')], [{ id: 'a1', name: 'X' } as { id: string; name: string }], [{ id: 'a1', description: 'Y' } as unknown as { id: string; name: string }])
    expect(out[0]).toMatchObject({ name: 'X', description: 'Y' })
  })
  it('hanterar null', () => {
    expect(mergeActivityDetails(null, null)).toEqual([])
  })
  it('dubblettsammanslagning ger samma pass-id med lätta rader + zoner på veckans som med fulla rader', () => {
    const full: Row[] = [
      base('g1', '2026-10-06T07:00:00Z', { source: 'garmin', hr_zones: [{ zone: 2, seconds: 600 }], name: 'Rodd', description: 'd' }),
      base('c1', '2026-10-06T07:00:30Z', { source: 'concept2', strava_id: 99 }),
      base('g2', '2026-08-01T07:00:00Z', { source: 'garmin', name: 'Gammal' }),
    ]
    const light = full.map(({ name: _n, description: _d, hr_zones: _h, ...rest }) => { void _n; void _d; void _h; return rest })
    const details = full.slice(0, 2).map(f => ({ id: f.id, name: f.name, hr_zones: f.hr_zones }))
    const merged = mergeActivityDetails(light, details)
    const a = dedupeForStats(full).map(r => r.id)
    const b = dedupeForStats(merged as Row[]).map(r => r.id)
    expect(b).toEqual(a)
    expect(dedupeForStats(merged as Row[])[0].hr_zones).toEqual([{ zone: 2, seconds: 600 }])
  })
})
