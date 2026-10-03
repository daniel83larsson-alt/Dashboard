import { describe, it, expect } from 'vitest'
import { parseQuickPickOverride } from './quick-pick-override'

describe('parseQuickPickOverride', () => {
  it('accepts a normal edit and rounds', () => {
    expect(parseQuickPickOverride({ name: ' Proteingröt ', calories: 319.4, proteinG: 28.46 })).toEqual({ ok: true, name: 'Proteingröt', calories: 319, proteinG: 28.5 })
  })
  it('allows empty protein (null) and a real 0', () => {
    expect(parseQuickPickOverride({ name: 'x', calories: 40, proteinG: null })).toMatchObject({ ok: true, proteinG: null })
    expect(parseQuickPickOverride({ name: 'x', calories: 40, proteinG: '' })).toMatchObject({ ok: true, proteinG: null })
    expect(parseQuickPickOverride({ name: 'x', calories: 40, proteinG: 0 })).toMatchObject({ ok: true, proteinG: 0 })
  })
  it('rejects missing name and out-of-range or non-numeric values', () => {
    expect(parseQuickPickOverride({ calories: 100 }).ok).toBe(false)
    expect(parseQuickPickOverride({ name: 'x', calories: 0 }).ok).toBe(false)
    expect(parseQuickPickOverride({ name: 'x', calories: 4001 }).ok).toBe(false)
    expect(parseQuickPickOverride({ name: 'x', calories: '300' }).ok).toBe(false)
    expect(parseQuickPickOverride({ name: 'x', calories: 300, proteinG: -1 }).ok).toBe(false)
    expect(parseQuickPickOverride({ name: 'x', calories: 300, proteinG: 401 }).ok).toBe(false)
    expect(parseQuickPickOverride(null).ok).toBe(false)
  })
})
