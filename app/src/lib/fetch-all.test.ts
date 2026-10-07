import { describe, it, expect } from 'vitest'
import { fetchAllPages } from './fetch-all'

const source = (n: number, cap: number) => (from: number, to: number) => {
  const end = Math.min(to, from + cap - 1, n - 1) // servern kapar vid `cap` rader
  const data = from >= n ? [] : Array.from({ length: end - from + 1 }, (_, i) => from + i)
  return Promise.resolve({ data, error: null })
}

describe('fetchAllPages', () => {
  it('hämtar allt över flera sidor (2 500 rader, tak 1 000)', async () => {
    const r = await fetchAllPages(source(2500, 1000))
    expect(r.complete).toBe(true)
    expect(r.data).toHaveLength(2500)
    expect(new Set(r.data).size).toBe(2500)
  })
  it('exakt en full sida följs av en tom sida', async () => {
    const r = await fetchAllPages(source(1000, 1000))
    expect(r.data).toHaveLength(1000)
    expect(r.complete).toBe(true)
  })
  it('färre än en sida', async () => {
    expect((await fetchAllPages(source(5, 1000))).data).toHaveLength(5)
  })
  it('fel → complete=false med det som hunnit hämtas', async () => {
    let calls = 0
    const r = await fetchAllPages((from, to) => {
      calls++
      return calls === 1 ? source(5000, 1000)(from, to) : Promise.resolve({ data: null, error: new Error('x') })
    })
    expect(r.complete).toBe(false)
    expect(r.data).toHaveLength(1000)
  })
})
