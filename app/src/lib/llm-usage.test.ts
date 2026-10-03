import { describe, it, expect } from 'vitest'
import { parseGeminiUsage, isOwnKey } from './llm-usage'
import { costSek, fmtSek, summarizeUsage } from './llm-pricing'

describe('parseGeminiUsage', () => {
  it('reads Google\'s usageMetadata (real shape from gemini-3.1-flash-lite)', () => {
    expect(parseGeminiUsage({ usageMetadata: { promptTokenCount: 63, candidatesTokenCount: 77, totalTokenCount: 140 } })).toEqual({ input: 63, output: 77, thinking: 0 })
    expect(parseGeminiUsage({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 40 } })).toEqual({ input: 10, output: 5, thinking: 40 })
  })
  it('returns null when there is no usage (error responses)', () => {
    expect(parseGeminiUsage({ error: { message: 'x' } })).toBeNull()
    expect(parseGeminiUsage(null)).toBeNull()
  })
})

describe('isOwnKey', () => {
  it('treats the shared env key as not-own and anything else as own', () => {
    const prev = process.env.GEMINI_API_KEY
    process.env.GEMINI_API_KEY = 'shared'
    expect(isOwnKey('shared')).toBe(false)
    expect(isOwnKey('personal')).toBe(true)
    process.env.GEMINI_API_KEY = prev
  })
})

describe('costSek', () => {
  it('prices 4 000 in + 400 out on gemini-3.1-flash-lite at ~1.6 öre (10 kr/USD)', () => {
    expect(costSek('gemini-3.1-flash-lite', 4000, 400, 10)).toBeCloseTo(0.016, 4)
  })
  it('uses the most expensive known price for an unknown model (never under-reports)', () => {
    expect(costSek('gemini-9-unknown', 1_000_000, 0, 10)).toBeCloseTo(15, 4)
  })
  it('formats small and large amounts', () => {
    expect(fmtSek(0)).toBe('0 kr'); expect(fmtSek(0.016)).toBe('0,02 kr'); expect(fmtSek(3.456)).toBe('3,5 kr'); expect(fmtSek(142.6)).toBe('143 kr')
  })
})

describe('summarizeUsage', () => {
  const row = (o: Partial<Parameters<typeof summarizeUsage>[0][number]>) => ({
    user_id: 'a', model: 'gemini-3.1-flash-lite', own_key: false,
    calls_30d: 10, input_30d: 40_000, output_30d: 4_000, calls_all: 10, input_all: 40_000, output_all: 4_000, ...o,
  })
  it('sums per user and in total, and excludes own-key calls from the cost (but counts them)', () => {
    const { byUser, total } = summarizeUsage([
      row({ user_id: 'a' }),
      row({ user_id: 'b', own_key: true }),
      row({ user_id: 'a', model: 'gemini-2.5-flash' }),
    ], 10)
    expect(byUser.get('a')!.calls30d).toBe(20)
    expect(byUser.get('b')!.sek30d).toBe(0)
    expect(byUser.get('b')!.ownKeyCalls30d).toBe(10)
    expect(total.calls30d).toBe(30)
    expect(total.sek30d).toBeCloseTo(byUser.get('a')!.sek30d, 6)
  })
})
