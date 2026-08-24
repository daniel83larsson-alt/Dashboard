import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withGarminLock } from './garmin'

// Regression test for a real production incident: Garmin's login endpoint
// (behind Cloudflare) started rate-limiting the nightly cron because
// withGarminLock serialized logins one after another with NO gap between
// them — fast enough to trip the rate limit even though only one login ran
// at a time. See STATUS.md for the full writeup.
describe('withGarminLock', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs queued work one at a time, never overlapping', async () => {
    let running = 0
    let maxConcurrent = 0
    const order: number[] = []

    async function task(n: number) {
      running++
      maxConcurrent = Math.max(maxConcurrent, running)
      order.push(n)
      await new Promise(r => setTimeout(r, 10)) // simulates the actual login/fetch work
      running--
      return n
    }

    const p1 = withGarminLock(() => task(1))
    const p2 = withGarminLock(() => task(2))
    const p3 = withGarminLock(() => task(3))

    await vi.runAllTimersAsync()
    const results = await Promise.all([p1, p2, p3])

    expect(maxConcurrent).toBe(1)
    expect(order).toEqual([1, 2, 3])
    expect(results).toEqual([1, 2, 3])
  })

  it('leaves a real gap between consecutive queued logins, not just serialization', async () => {
    const startTimes: number[] = []

    async function task() {
      startTimes.push(Date.now())
    }

    const p1 = withGarminLock(task)
    const p2 = withGarminLock(task)
    const p3 = withGarminLock(task)

    await vi.runAllTimersAsync()
    await Promise.all([p1, p2, p3])

    expect(startTimes).toHaveLength(3)
    // Each subsequent login must wait for the fixed delay after the
    // previous one finishes — this is the actual fix for the Cloudflare
    // 429s, not just "one at a time with no spacing".
    expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(4000)
    expect(startTimes[2] - startTimes[1]).toBeGreaterThanOrEqual(4000)
  })

  it('still delays the next task even when one in the queue throws', async () => {
    const order: string[] = []

    const p1 = withGarminLock(async () => { order.push('a'); throw new Error('boom') })
    const p2 = withGarminLock(async () => { order.push('b') })

    await vi.runAllTimersAsync()
    await expect(p1).rejects.toThrow('boom')
    await p2

    expect(order).toEqual(['a', 'b'])
  })
})
