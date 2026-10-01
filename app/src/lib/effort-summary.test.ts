import { describe, it, expect } from 'vitest'
import { computeEffortSummary, effortPromptLines, type EffortRow } from './effort-summary'

const zones = (...secs: number[]) => secs.map((s, i) => ({ zoneNumber: i + 1, secsInZone: s }))
const row = (o: Partial<EffortRow> & { id: string }): EffortRow => ({ sport_type: 'Run', start_date: '2026-09-10T08:00:00Z', ...o })

describe('computeEffortSummary', () => {
  it('returns null when no pass has zones or training effect', () => {
    expect(computeEffortSummary([row({ id: 'a' })], 1)).toBeNull()
  })
  it('sums time across passes into % per zone and reports X of Y', () => {
    const e = computeEffortSummary([
      row({ id: 'a', hr_zones: zones(0, 600, 300, 0, 0) }),
      row({ id: 'b', hr_zones: zones(0, 300, 0, 0, 0) }),
      row({ id: 'c' }),
    ], 3)!
    expect(e.zonePasses).toBe(2)
    expect(e.totalPasses).toBe(3)
    expect(e.zones.find(z => z.zoneNumber === 2)?.pct).toBe(75)
    expect(e.zones.find(z => z.zoneNumber === 3)?.pct).toBe(25)
  })
  it('averages training effect and finds the hardest pass by aerobic effect', () => {
    const e = computeEffortSummary([
      row({ id: 'a', aerobic_te: 2.5, anaerobic_te: 0 }),
      row({ id: 'b', aerobic_te: 4.5, anaerobic_te: 1.2, sport_type: 'Rowing' }),
    ], 2)!
    expect(e.teAvgAerobic).toBe(3.5)
    expect(e.teAvgAnaerobic).toBe(0.6)
    expect(e.hardest?.activityId).toBe('b')
    expect(e.tePasses).toBe(2)
  })
  it('ignores non-numeric effect values and never lets X exceed Y', () => {
    const e = computeEffortSummary([row({ id: 'a', aerobic_te: 'x', hr_zones: zones(1, 1, 1, 1, 1) })], 0)!
    expect(e.tePasses).toBe(0)
    expect(e.totalPasses).toBe(1)
  })
})

describe('effortPromptLines', () => {
  it('produces a zone line and an effect line', () => {
    const e = computeEffortSummary([row({ id: 'a', hr_zones: zones(0, 100, 0, 0, 0), aerobic_te: 3, anaerobic_te: 0.5 })], 2)!
    const lines = effortPromptLines(e)
    expect(lines[0]).toContain('1 av 2 pass')
    expect(lines[0]).toContain('Zon 2 100 %')
    expect(lines[1]).toContain('hårdaste passet')
  })
})

import { effortEmailHtml } from './effort-email'
describe('effortEmailHtml', () => {
  it('renders nothing without data and escapes the AI sentence', () => {
    expect(effortEmailHtml(null, 'x', 'T')).toBe('')
    const e = computeEffortSummary([row({ id: 'a', hr_zones: zones(0, 100, 0, 0, 0) })], 1)!
    const html = effortEmailHtml(e, '<b>hej</b>', 'Intensitet')
    expect(html).toContain('&lt;b&gt;hej&lt;/b&gt;')
    expect(html).toContain('1 av 1 pass')
  })
})
