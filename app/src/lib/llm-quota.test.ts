import { describe, it, expect } from 'vitest'
import { isQuotaError, retryAfterMinutes, quotaMessage } from './llm-quota'

const real = new Error('Gemini call failed: You exceeded your current quota, please check your plan and billing details. Please retry in 3h17m56.577669797s.')

describe('llm-quota', () => {
  it('recognises Gemini quota errors but not other failures', () => {
    expect(isQuotaError(real)).toBe(true)
    expect(isQuotaError(new Error('Gemini call failed: 429'))).toBe(true)
    expect(isQuotaError(new Error('Gemini call failed: API key not valid'))).toBe(false)
    expect(isQuotaError(undefined)).toBe(false)
  })
  it('parses the retry delay into minutes', () => {
    expect(retryAfterMinutes(real)).toBe(198)
    expect(retryAfterMinutes(new Error('quota. Please retry in 45.2s'))).toBe(1)
    expect(retryAfterMinutes(new Error('quota. Please retry in 12m30s'))).toBe(13)
    expect(retryAfterMinutes(new Error('quota exceeded'))).toBeNull()
  })
  it('writes an honest Swedish message with the wait', () => {
    expect(quotaMessage(real)).toContain('AI-kvoten för idag är slut')
    expect(quotaMessage(real)).toContain('ungefär 3 timmar och 18 minuter')
    expect(quotaMessage(new Error('quota. retry in 12m30s'))).toContain('ungefär 13 minuter')
    expect(quotaMessage(new Error('quota exceeded'))).toContain('om en stund')
  })
})
