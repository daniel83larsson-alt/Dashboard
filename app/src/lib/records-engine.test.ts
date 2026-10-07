import { describe, it, expect } from 'vitest'
import { recordLabelsBySession, sessionsOf, monthlyTotals } from './records-engine'
import { newRecordsForLatest } from './records'
import type { ActivityRow } from './duplicates'

// Deterministisk slumpgenerator så testet är reproducerbart.
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

function randomHistory(seed: number, n: number): ActivityRow[] {
  const r = rng(seed)
  const sports = ['Rowing', 'Run', 'Ride', 'Kettlebell', 'Walk']
  const benchDist = [1000, 3000, 5000, 10000, 20000, 400, 7500]
  const rows: ActivityRow[] = []
  const base = Date.parse('2026-01-01T06:00:00Z')
  for (let i = 0; i < n; i++) {
    const sport = sports[Math.floor(r() * sports.length)]
    const nearBench = r() < 0.6
    const distance = nearBench ? benchDist[Math.floor(r() * benchDist.length)] * (0.94 + r() * 0.12) : Math.round(r() * 12000)
    const moving = r() < 0.5 ? [1200, 1800, 2700][Math.floor(r() * 3)] + Math.round((r() - 0.5) * 300) : Math.round(30 + r() * 4000)
    // en del pass med exakt samma starttid för att prova likhetsfallet
    const day = Math.floor(r() * 120)
    const tie = r() < 0.15
    const start = new Date(base + day * 86400000 + (tie ? 0 : Math.floor(r() * 86400) * 1000)).toISOString()
    rows.push({ id: `a${i}`, strava_id: 1000 + i, start_date: start, distance: Math.round(distance), moving_time: moving, sport_type: sport, source: 'garmin' })
  }
  return rows
}

describe('recordLabelsBySession — samma resultat som den gamla newRecordsForLatest', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`slumpad historik, frö ${seed}`, () => {
      const sessions = sessionsOf(randomHistory(seed, 120))
      const fast = recordLabelsBySession(sessions)
      for (const s of sessions) {
        const t = Date.parse(s.start_date)
        const earlier = sessions.filter(o => o.id !== s.id && Date.parse(o.start_date) < t)
        const legacy = newRecordsForLatest(s, earlier)
        expect(fast.get(s.id) ?? [], `pass ${s.id} (${s.sport_type} ${s.distance} m ${s.moving_time} s)`).toEqual(legacy)
      }
    })
  }

  it('första passet i en kategori är aldrig ett rekord, men ett senare, klart bättre är det', () => {
    const rows: ActivityRow[] = [
      { id: 'a', strava_id: 1, start_date: '2026-03-01T08:00:00Z', distance: 5000, moving_time: 1800, sport_type: 'Run', source: 'garmin' },
      { id: 'b', strava_id: 2, start_date: '2026-03-08T08:00:00Z', distance: 5000, moving_time: 1700, sport_type: 'Run', source: 'garmin' },
    ]
    const m = recordLabelsBySession(sessionsOf(rows))
    expect(m.has('a')).toBe(false)
    expect(m.get('b')).toContain('Snabbaste 5 km')
  })

  it('en Garmin+Concept2-dubblett räknas som ett pass och blockerar inte rekordet', () => {
    const rows: ActivityRow[] = [
      { id: 'g1', strava_id: 11, start_date: '2026-03-01T08:00:00Z', distance: 5000, moving_time: 1500, sport_type: 'Rowing', source: 'garmin' },
      { id: 'c1', strava_id: -11, start_date: '2026-03-01T08:00:00Z', distance: 5000, moving_time: 1500, sport_type: 'Rowing', source: 'concept2' },
      { id: 'g2', strava_id: 12, start_date: '2026-03-08T08:00:00Z', distance: 5000, moving_time: 1400, sport_type: 'Rowing', source: 'garmin' },
    ]
    const s = sessionsOf(rows)
    expect(s).toHaveLength(2)
    expect(recordLabelsBySession(s).get('g2')).toContain('Snabbaste 5 km')
  })
})

describe('monthlyTotals', () => {
  it('summerar per månad på verkliga pass', () => {
    const rows: ActivityRow[] = [
      { id: 'a', strava_id: 1, start_date: '2026-09-03T08:00:00Z', distance: 5000, moving_time: 1800, sport_type: 'Run', source: 'garmin' },
      { id: 'b', strava_id: 2, start_date: '2026-09-20T08:00:00Z', distance: 3000, moving_time: 1000, sport_type: 'Run', source: 'garmin' },
      { id: 'c', strava_id: 3, start_date: '2026-10-02T08:00:00Z', distance: 0, moving_time: 1200, sport_type: 'Kettlebell', source: 'manual' },
    ]
    expect(monthlyTotals(sessionsOf(rows))).toEqual({
      '2026-09': { sec: 2800, m: 8000, n: 2 },
      '2026-10': { sec: 1200, m: 0, n: 1 },
    })
  })
})
