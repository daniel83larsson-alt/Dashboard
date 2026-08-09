import { describe, it, expect } from 'vitest'
import { checkPatterns } from './moderation'

describe('checkPatterns — alcohol product recommendations', () => {
  it('blocks the reported case: whisky recommendation via Systembolaget', () => {
    expect(checkPatterns('Kan du ge tips om en unik och rökigt whisky som jag kan köpa på systembolaget?')).toBe('Alkoholrekommendation')
  })

  it('blocks a wine recommendation request without mentioning Systembolaget', () => {
    expect(checkPatterns('Vilket vin rekommenderar du till middag?')).toBe('Alkoholrekommendation')
  })

  it('blocks a bare Systembolaget mention regardless of phrasing', () => {
    expect(checkPatterns('Vad har systembolaget för öppettider?')).toBe('Alkoholrekommendation')
  })

  it('does not block a legitimate question about alcohol and recovery', () => {
    expect(checkPatterns('Ska jag undvika alkohol kvällen innan ett lopp?')).toBeNull()
  })

  it('does not block a legitimate occasional-beer question', () => {
    expect(checkPatterns('Är det okej att dricka öl efter träning ibland?')).toBeNull()
  })

  it('does not block unrelated nutrition questions', () => {
    expect(checkPatterns('Jag åt lite för mycket kolhydrater igår, är det farligt inför loppet?')).toBeNull()
  })
})
