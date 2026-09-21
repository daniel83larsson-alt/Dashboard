import { describe, it, expect } from 'vitest'
import { computeBudgetHistory } from './budget-history'
import type { McpBudgetHistoryRow } from './fetch-budget-history'

const TODAY_KEY = '2026-09-20'

function row(overrides: Partial<McpBudgetHistoryRow> = {}): McpBudgetHistoryRow {
  return {
    kind: 'settings_changed', createdAt: '2026-09-13T14:38:42Z',
    oldBudgetKcal: 2160, newBudgetKcal: 2049, newTdeeKcal: 2680,
    bmrKcal: 1900, trainingKcal: 200, neatFactor: 1.25, garminCorrection: 0.75,
    ...overrides,
  }
}

describe('computeBudgetHistory', () => {
  it('translates the kind to a Swedish label and includes the raw kind too', () => {
    const h = computeBudgetHistory([row({ kind: 'milestone_set' })], 30, TODAY_KEY)
    expect(h.events[0].kind).toBe('milestone_set')
    expect(h.events[0].kind_label).toBe('Delmål satt')
  })

  it('falls back to the raw kind string for an unrecognized kind', () => {
    const h = computeBudgetHistory([row({ kind: 'something_new' })], 30, TODAY_KEY)
    expect(h.events[0].kind_label).toBe('something_new')
  })

  it('excludes events older than the requested window', () => {
    const recent = row({ createdAt: '2026-09-19T00:00:00Z' })
    const old = row({ createdAt: '2026-08-01T00:00:00Z' })
    const h = computeBudgetHistory([recent, old], 7, TODAY_KEY)
    expect(h.events).toHaveLength(1)
    expect(h.events[0].date).toBe('2026-09-19')
  })

  it('explains a change by diffing against the immediately preceding event, even if that one is outside the window', () => {
    const older = row({ createdAt: '2026-09-01T00:00:00Z', trainingKcal: 100 })
    const visible = row({ createdAt: '2026-09-19T00:00:00Z', trainingKcal: 250 })
    const h = computeBudgetHistory([visible, older], 7, TODAY_KEY) // unsorted input, oldest not first
    expect(h.events).toHaveLength(1)
    expect(h.events[0].reason).toContain('ökade')
  })

  it('reports a null reason for the very first event ever (no previous to diff against)', () => {
    const h = computeBudgetHistory([row({ createdAt: '2026-09-19T00:00:00Z' })], 30, TODAY_KEY)
    expect(h.events[0].reason).toBeNull()
  })

  it('orders events oldest first', () => {
    const first = row({ createdAt: '2026-09-10T00:00:00Z' })
    const second = row({ createdAt: '2026-09-15T00:00:00Z' })
    const h = computeBudgetHistory([second, first], 30, TODAY_KEY)
    expect(h.events.map(e => e.date)).toEqual(['2026-09-10', '2026-09-15'])
  })

  it('period_days echoes the requested window', () => {
    const h = computeBudgetHistory([], 30, TODAY_KEY)
    expect(h.period_days).toBe(30)
    expect(h.events).toEqual([])
  })
})
