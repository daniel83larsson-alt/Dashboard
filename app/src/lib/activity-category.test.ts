import { describe, it, expect } from 'vitest'
import { classifyActivity, effectiveLthr, intensityMinutes } from './activity-category'

const LTHR = 149 // Daniels (antagna) LTHR — 80 % = 119,2

describe('classifyActivity — Daniels testfall', () => {
  it('Vandring 9 min, puls 101 → Vardagsrörelse', () => {
    expect(classifyActivity({ sport: 'Hike', durationSec: 9 * 60, avgHr: 101, lthr: LTHR }).category).toBe('daily_movement')
  })
  it('Vandring 28 min, puls 91 → Vardagsrörelse', () => {
    expect(classifyActivity({ sport: 'Hike', durationSec: 28 * 60, avgHr: 91, lthr: LTHR }).category).toBe('daily_movement')
  })
  it('Vandring 37 min, puls 102 → Vardagsrörelse', () => {
    expect(classifyActivity({ sport: 'Hike', durationSec: 37 * 60, avgHr: 102, lthr: LTHR }).category).toBe('daily_movement')
  })
  it('Rodd 30 min, puls 125 → Träning', () => {
    const r = classifyActivity({ sport: 'Rowing', durationSec: 30 * 60, avgHr: 125, lthr: LTHR })
    expect(r).toMatchObject({ category: 'training', rule: 'hr_rule' })
  })
  it('Rodd 30 min, puls 144 → Träning', () => {
    expect(classifyActivity({ sport: 'Rowing', durationSec: 30 * 60, avgHr: 144, lthr: LTHR }).category).toBe('training')
  })
  it('Kettlebell 20 min, set loggade → Träning', () => {
    expect(classifyActivity({ sport: 'Kettlebell', durationSec: 20 * 60, avgHr: null, hasLoggedSets: true, lthr: LTHR })).toMatchObject({ category: 'training', rule: 'strength_sets' })
  })
  it('Cykel 10 min, puls 95, vardag → Vardagsrörelse + föreslagen tagg Pendling', () => {
    const r = classifyActivity({ sport: 'Ride', durationSec: 10 * 60, avgHr: 95, lthr: LTHR }, { isWeekday: true, sameStartEndOnOtherDays: true })
    expect(r.category).toBe('daily_movement')
    expect(r.suggestTag).toBe('Pendling')
  })
})

describe('classifyActivity — övriga regler', () => {
  it('användarens eget val slår allt', () => {
    expect(classifyActivity({ sport: 'Rowing', durationSec: 1800, avgHr: 150, lthr: LTHR, userCategory: 'daily_movement' })).toMatchObject({ category: 'daily_movement', rule: 'user' })
  })
  it('rodd under 20 min är aldrig träning, även med hög puls', () => {
    expect(classifyActivity({ sport: 'Rowing', durationSec: 19 * 60, avgHr: 150, lthr: LTHR }).category).toBe('daily_movement')
  })
  it('lugn rodd med låg snittpuls blir träning via zondata (≥ 50 % av tiden i zon 2+)', () => {
    const r = classifyActivity({ sport: 'Rowing', durationSec: 1791, avgHr: 115, lthr: LTHR, zoneSecs: [47, 1681, 54, 0, 0] })
    expect(r).toMatchObject({ category: 'training', note: 'minst 50 % av tiden i zon 2+' })
  })
  it('lugn cykling utan zonstöd och låg puls → Vardagsrörelse', () => {
    expect(classifyActivity({ sport: 'Ride', durationSec: 40 * 60, avgHr: 100, lthr: LTHR }).rule).toBe('hr_below_threshold')
  })
  it('saknas puls: kort gång/cykel → Vardagsrörelse; ≥ 60 min → fråga användaren', () => {
    expect(classifyActivity({ sport: 'Walk', durationSec: 40 * 60, avgHr: null }).rule).toBe('no_hr_short_walk_or_ride')
    expect(classifyActivity({ sport: 'Ride', durationSec: 90 * 60, avgHr: null })).toMatchObject({ rule: 'no_hr_ask_user', askUser: true })
  })
  it('pendlingsförslag kräver cykel/gång, under 30 min, vardag och återkommande start/slut', () => {
    const base = { sport: 'Walk', durationSec: 20 * 60, avgHr: 95, lthr: LTHR }
    expect(classifyActivity(base, { isWeekday: true, sameStartEndOnOtherDays: true }).suggestTag).toBe('Pendling')
    expect(classifyActivity(base, { isWeekday: false, sameStartEndOnOtherDays: true }).suggestTag).toBeUndefined()
    expect(classifyActivity({ ...base, durationSec: 35 * 60 }, { isWeekday: true, sameStartEndOnOtherDays: true }).suggestTag).toBeUndefined()
    expect(classifyActivity(base, { isWeekday: true, sameStartEndOnOtherDays: false }).suggestTag).toBeUndefined()
  })
  it('saknad LTHR → 65 % av maxpuls', () => {
    expect(effectiveLthr(null, 180)).toBe(117)
    expect(effectiveLthr(149, 180)).toBe(149)
    expect(effectiveLthr(null, null)).toBeNull()
  })
  it('intensitetsminuter: Z2–Z3 = 1 min, Z4+ = 2 min', () => {
    expect(intensityMinutes([60, 600, 600, 300, 0])).toBe(Math.round((600 + 600 + 600) / 60)) // 30
    expect(intensityMinutes(null)).toBeNull()
  })
})
