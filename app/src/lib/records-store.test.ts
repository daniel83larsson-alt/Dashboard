import { describe, it, expect } from 'vitest'
import { planChanges } from './records-store'

type R = { k: string; v: number }
const key = (r: R) => r.k
const same = (a: R, b: R) => a.v === b.v

describe('planChanges', () => {
  it('lägger till nya, uppdaterar ändrade, tar bort borttagna och rör inte oförändrade', () => {
    const existing: R[] = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'c', v: 3 }]
    const desired: R[] = [{ k: 'a', v: 1 }, { k: 'b', v: 20 }, { k: 'd', v: 4 }]
    const plan = planChanges(existing, desired, key, same)
    expect(plan.upsert).toEqual([{ k: 'b', v: 20 }, { k: 'd', v: 4 }])
    expect(plan.remove).toEqual([{ k: 'c', v: 3 }])
  })
  it('identiska listor ger inga ändringar (så en avstämning utan avvikelse blir tyst)', () => {
    const rows: R[] = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }]
    expect(planChanges(rows, [...rows], key, same)).toEqual({ upsert: [], remove: [] })
  })
  it('tom mål-lista tar bort allt, tom befintlig lägger till allt', () => {
    expect(planChanges([{ k: 'a', v: 1 }], [], key, same).remove).toHaveLength(1)
    expect(planChanges([], [{ k: 'a', v: 1 }], key, same).upsert).toHaveLength(1)
  })
})
