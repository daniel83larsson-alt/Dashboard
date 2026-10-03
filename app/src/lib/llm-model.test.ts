import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GEMINI_MODEL, geminiUrl } from './llm-model'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

describe('llm-model', () => {
  it('builds the generateContent URL from the single configured model', () => {
    expect(geminiUrl()).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`)
    expect(geminiUrl('gemini-x')).toContain('/models/gemini-x:generateContent')
  })
  it('defaults to a Gemini 3 model (2.5 is retired for new projects)', () => {
    expect(GEMINI_MODEL).toMatch(/^gemini-3/)
  })
  it('no other source file hardcodes a Gemini model name or thinkingBudget (change it in lib/llm-model.ts)', () => {
    const offenders = walk(join(__dirname, '..'))
      .filter(f => !f.endsWith('llm-model.ts'))
      .filter(f => /models\/gemini-|thinkingBudget/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
