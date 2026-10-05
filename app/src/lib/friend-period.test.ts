import { describe, it, expect } from 'vitest'
import { buildPersonPeriods, totalsForPeriod, availablePeriods } from './friend-period'

let id = 0
const act = (owner: string, date: string, min: number, km = 0) => ({
  id: String(++id), strava_id: id, owner_id: owner, start_date: `${date}T08:00:00Z`,
  distance: km * 1000, moving_time: min * 60, sport_type: 'Run', source: 'garmin',
})
const people = [
  { ownerId: 'me', ownerName: 'Du', isSelf: true },
  { ownerId: 'a', ownerName: 'Anna', isSelf: false },
  { ownerId: 'b', ownerName: 'Bo', isSelf: false },
]
const rows = [
  act('me', '2026-09-03', 60, 10), act('me', '2026-10-02', 30, 5),
  act('a', '2026-09-10', 120, 20), act('a', '2026-09-20', 60, 10), act('a', '2025-12-31', 45, 8),
]

describe('friend-period', () => {
  const periods = buildPersonPeriods(rows, people)

  it('summerar vald månad per person och sorterar mest aktiv först', () => {
    const sep = totalsForPeriod(periods, { kind: 'month', key: '2026-09' })
    expect(sep.map(r => r.ownerName)).toEqual(['Anna', 'Du', 'Bo'])
    expect(sep[0]).toMatchObject({ sec: 180 * 60, m: 30000, n: 2 })
    expect(sep[2]).toMatchObject({ sec: 0, n: 0 }) // vän utan pass visas med 0 — poängen är att se vem som är aktiv
  })

  it('år = summan av årets månader, och gränsen mellan åren hålls isär', () => {
    const y26 = totalsForPeriod(periods, { kind: 'year', key: '2026' })
    expect(y26.find(r => r.ownerId === 'me')).toMatchObject({ sec: 90 * 60, n: 2 })
    expect(y26.find(r => r.ownerId === 'a')).toMatchObject({ sec: 180 * 60, n: 2 })
    const y25 = totalsForPeriod(periods, { kind: 'year', key: '2025' })
    expect(y25.find(r => r.ownerId === 'a')).toMatchObject({ sec: 45 * 60, n: 1 })
  })

  it('räknar en Garmin+Concept2-dubblett av samma pass en gång', () => {
    const t = '2026-09-05T07:00:00Z'
    const dup = [
      { id: 'g', strava_id: 1, owner_id: 'a', start_date: t, distance: 5000, moving_time: 1500, sport_type: 'Rowing', source: 'garmin' },
      { id: 'c', strava_id: 2, owner_id: 'a', start_date: t, distance: 5000, moving_time: 1500, sport_type: 'Rowing', source: 'concept2' },
    ]
    const r = totalsForPeriod(buildPersonPeriods(dup, people), { kind: 'month', key: '2026-09' }).find(x => x.ownerId === 'a')!
    expect(r.n).toBe(1)
  })

  it('listar tillgängliga månader/år nyast först och tar alltid med innevarande månad', () => {
    const av = availablePeriods(periods, '2026-10-05')
    expect(av.months).toEqual(['2026-10', '2026-09', '2025-12'])
    expect(av.years).toEqual(['2026', '2025'])
    expect(availablePeriods([], '2026-10-05').months).toEqual(['2026-10'])
  })
})
