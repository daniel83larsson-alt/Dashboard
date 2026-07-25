import { describe, it, expect } from 'vitest'
import { nextRateLimitState } from './rate-limit'

const HOURLY_LIMIT = 15
const WINDOW_MS = 60 * 60 * 1000
const MIN_SPACING_MS = 4000

const NOW = 1_800_000_000_000 // fixed arbitrary epoch ms

describe('nextRateLimitState', () => {
  it('starts a fresh window on the first-ever request (no stored state)', () => {
    const { result, nextState } = nextRateLimitState(null, NOW)
    expect(result).toEqual({ allowed: true })
    expect(nextState).toEqual({ windowStart: NOW, count: 1, lastAt: NOW })
  })

  it('allows and increments while within the window and under the cap', () => {
    const prev = JSON.stringify({ windowStart: NOW - 10_000, count: 5, lastAt: NOW - 5000 })
    const { result, nextState } = nextRateLimitState(prev, NOW)
    expect(result).toEqual({ allowed: true })
    expect(nextState).toEqual({ windowStart: NOW - 10_000, count: 6, lastAt: NOW })
  })

  it('rejects once the hourly cap is reached within the window, and does not persist a new state', () => {
    const prev = JSON.stringify({ windowStart: NOW - 10_000, count: HOURLY_LIMIT, lastAt: NOW - 5000 })
    const { result, nextState } = nextRateLimitState(prev, NOW)
    expect(result.allowed).toBe(false)
    expect((result as Extract<typeof result, { allowed: false }>).reason).toBe('hourly')
    expect(nextState).toBeNull()
  })

  it('rejects a request that comes in faster than the minimum spacing, and does not persist a new state', () => {
    const prev = JSON.stringify({ windowStart: NOW - 10_000, count: 1, lastAt: NOW - 1000 }) // 1s ago, spacing is 4s
    const { result, nextState } = nextRateLimitState(prev, NOW)
    expect(result.allowed).toBe(false)
    expect((result as Extract<typeof result, { allowed: false }>).reason).toBe('spacing')
    expect(nextState).toBeNull()
  })

  it('resets to a clean window once the window has elapsed, even if the old count was at/over the cap', () => {
    const prev = JSON.stringify({ windowStart: NOW - WINDOW_MS - 1, count: HOURLY_LIMIT, lastAt: NOW - WINDOW_MS - 1 })
    const { result, nextState } = nextRateLimitState(prev, NOW)
    expect(result).toEqual({ allowed: true })
    expect(nextState).toEqual({ windowStart: NOW, count: 1, lastAt: NOW })
  })

  it('recovers cleanly from a corrupt/unparseable stored JSON value by treating it as a fresh window, without throwing', () => {
    const corrupted = '{not valid json'
    expect(() => nextRateLimitState(corrupted, NOW)).not.toThrow()
    const { result, nextState } = nextRateLimitState(corrupted, NOW)
    expect(result).toEqual({ allowed: true })
    expect(nextState).toEqual({ windowStart: NOW, count: 1, lastAt: NOW })
  })

  it('MIN_SPACING_MS sanity: a request right at the boundary (exactly the spacing gap) is allowed', () => {
    const prev = JSON.stringify({ windowStart: NOW - 10_000, count: 1, lastAt: NOW - MIN_SPACING_MS })
    const { result } = nextRateLimitState(prev, NOW)
    expect(result).toEqual({ allowed: true })
  })
})
