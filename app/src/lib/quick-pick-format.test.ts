import { describe, it, expect } from 'vitest'
import { quickPickMacroText } from './quick-pick-format'

describe('quickPickMacroText', () => {
  it('shows kcal and rounded protein', () => {
    expect(quickPickMacroText({ calories: 319, protein_g: 28.4 })).toEqual({ kcal: '319 kcal', protein: '28 g protein', proteinKnown: true })
  })
  it('says "protein saknas" instead of a fake 0 g when protein is missing', () => {
    expect(quickPickMacroText({ calories: 150, protein_g: null }).protein).toBe('protein saknas')
    expect(quickPickMacroText({ calories: 150, protein_g: null }).proteinKnown).toBe(false)
  })
  it('keeps a real 0 g protein as 0 g (e.g. saltgurka)', () => {
    expect(quickPickMacroText({ calories: 40, protein_g: 0 }).protein).toBe('0 g protein')
  })
})
