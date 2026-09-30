import { describe, it, expect } from 'vitest'
import { friendRecordBadges, type FriendHistoryRow } from './friend-records'

let seq = 0
function row(overrides: Partial<FriendHistoryRow> = {}): FriendHistoryRow {
  seq++
  return {
    activity_id: `act-${seq}`,
    owner_id: 'friend-1',
    sport_type: 'Run',
    distance: 5000,
    moving_time: 1500, // 25:00 for 5 km
    start_date: '2026-09-01T08:00:00Z',
    source: 'garmin',
    strava_id: seq,
    ...overrides,
  }
}

describe('friendRecordBadges', () => {
  it('flags a pass that beats the same person\'s previous fastest 5 km', () => {
    const prior = row({ start_date: '2026-09-01T08:00:00Z', moving_time: 1500 })
    const faster = row({ start_date: '2026-09-10T08:00:00Z', moving_time: 1440 })
    const badges = friendRecordBadges([prior, faster], [faster])
    expect(badges.get(faster.activity_id)).toEqual(['Snabbaste 5 km'])
  })

  it('does not flag a pass that is slower than, or exactly ties, their previous best', () => {
    const prior = row({ start_date: '2026-09-01T08:00:00Z', moving_time: 1500 })
    // An earlier, much longer outing so the slower 5 km can't ALSO be the
    // "longest session ever" (26:00 would otherwise beat the 25:00 prior on
    // duration alone — a legitimate, separate record, tested further down).
    const longBase = row({ start_date: '2026-08-01T08:00:00Z', distance: 21000, moving_time: 7200 })
    const slower = row({ start_date: '2026-09-10T08:00:00Z', moving_time: 1560 })
    const tie = row({ start_date: '2026-09-12T08:00:00Z', moving_time: 1500 })
    const badges = friendRecordBadges([longBase, prior, slower, tie], [slower, tie])
    expect(badges.size).toBe(0)
  })

  it('gives no badge for a hairline improvement (<1 %) — e.g. a repeated commute a few metres better', () => {
    const longBase = row({ start_date: '2026-08-01T08:00:00Z', distance: 21000, moving_time: 7200 })
    const prior = row({ sport_type: 'Ride', distance: 8000, moving_time: 1290, start_date: '2026-09-01T08:00:00Z' })
    const hairline = row({ sport_type: 'Ride', distance: 8030, moving_time: 1290, start_date: '2026-09-08T08:00:00Z' }) // +0.4 %
    const real = row({ sport_type: 'Ride', distance: 8120, moving_time: 1290, start_date: '2026-09-15T08:00:00Z' }) // +1.1 % over the 8030 best
    const badges = friendRecordBadges([longBase, prior, hairline, real], [hairline, real])
    expect(badges.has(hairline.activity_id)).toBe(false)
    expect(badges.get(real.activity_id)).toEqual(['Bäst 20 min'])
  })

  it('does not treat a person\'s first pass in a category as a broken record', () => {
    const only = row({ moving_time: 1200 })
    expect(friendRecordBadges([only], [only]).size).toBe(0)
  })

  it('compares each person only against their OWN earlier passes, never a different friend\'s', () => {
    const aFast = row({ owner_id: 'a', start_date: '2026-08-01T08:00:00Z', moving_time: 1200 })
    const bPrior = row({ owner_id: 'b', start_date: '2026-08-05T08:00:00Z', moving_time: 1800 })
    const bNew = row({ owner_id: 'b', start_date: '2026-09-10T08:00:00Z', moving_time: 1700 })
    // b's 28:20 is far slower than a's 20:00 — still a personal best for b.
    const badges = friendRecordBadges([aFast, bPrior, bNew], [bNew])
    expect(badges.get(bNew.activity_id)).toEqual(['Snabbaste 5 km'])
  })

  it('keeps the badge on the pass that set a record even after it is beaten later', () => {
    const prior = row({ start_date: '2026-09-01T08:00:00Z', moving_time: 1500 })
    const first = row({ start_date: '2026-09-10T08:00:00Z', moving_time: 1440 })
    const beatsIt = row({ start_date: '2026-09-20T08:00:00Z', moving_time: 1400 })
    const badges = friendRecordBadges([prior, first, beatsIt], [beatsIt, first])
    expect(badges.get(first.activity_id)).toEqual(['Snabbaste 5 km'])
    expect(badges.get(beatsIt.activity_id)).toEqual(['Snabbaste 5 km'])
  })

  it('never counts a pass\'s own sync twin as an earlier pass (Garmin + Concept2 of the same row)', () => {
    const prior = row({ sport_type: 'Rowing', source: 'concept2', start_date: '2026-09-01T08:00:00Z', moving_time: 1500 })
    // Same real session synced twice. The Concept2 copy starts a few seconds
    // BEFORE the Garmin copy and is 5 s faster — undeduped, it would sit in
    // the Garmin copy's "earlier passes" and block the record.
    const concept2 = row({ sport_type: 'Rowing', source: 'concept2', start_date: '2026-09-10T07:59:50Z', moving_time: 1440 })
    const garmin = row({ sport_type: 'Rowing', source: 'garmin', start_date: '2026-09-10T08:00:00Z', moving_time: 1445 })
    const badges = friendRecordBadges([prior, concept2, garmin], [garmin])
    expect(badges.get(garmin.activity_id)).toEqual(['Snabbaste 5 km'])
  })

  it('flags "Längsta passet någonsin" for a sport with no distance PRs, and only when it really is the longest', () => {
    const p1 = row({ sport_type: 'Tennis', distance: 0, moving_time: 3000, start_date: '2026-09-01T08:00:00Z' })
    const p2 = row({ sport_type: 'Tennis', distance: 0, moving_time: 2400, start_date: '2026-09-05T08:00:00Z' })
    const longest = row({ sport_type: 'Tennis', distance: 0, moving_time: 3540, start_date: '2026-09-10T08:00:00Z' })
    const shorter = row({ sport_type: 'Tennis', distance: 0, moving_time: 2000, start_date: '2026-09-12T08:00:00Z' })
    const badges = friendRecordBadges([p1, p2, longest, shorter], [longest, shorter])
    expect(badges.get(longest.activity_id)).toEqual(['Längsta passet någonsin'])
    expect(badges.has(shorter.activity_id)).toBe(false)
  })

  it('gives no badge, and does not crash, for a feed entry whose owner has no history rows', () => {
    const stray = row({ owner_id: 'unknown' })
    expect(friendRecordBadges([row()], [stray]).size).toBe(0)
  })
})
