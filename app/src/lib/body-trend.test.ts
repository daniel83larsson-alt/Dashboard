import { describe, it, expect } from 'vitest'
import { detectBodyTrendNote, bodyTrendNoteLabel } from './body-trend'

const TODAY = '2026-08-30'

describe('detectBodyTrendNote', () => {
  it('notes when weight is flat/up but waist has meaningfully dropped', () => {
    const note = detectBodyTrendNote({
      weighIns: [{ date: '2026-08-10', weightKg: 100 }, { date: '2026-08-30', weightKg: 100.2 }],
      waistMeasurements: [{ date: '2026-08-10', waistCm: 105 }, { date: '2026-08-30', waistCm: 103.5 }],
      todayKey: TODAY,
    })
    expect(note).toEqual({ kind: 'waist_progressing_despite_flat_weight', waistDropCm: 1.5 })
  })

  it('says nothing when weight is also dropping (no plateau to reassure about)', () => {
    const note = detectBodyTrendNote({
      weighIns: [{ date: '2026-08-10', weightKg: 100 }, { date: '2026-08-30', weightKg: 98 }],
      waistMeasurements: [{ date: '2026-08-10', waistCm: 105 }, { date: '2026-08-30', waistCm: 103.5 }],
      todayKey: TODAY,
    })
    expect(note).toBeNull()
  })

  it('says nothing when waist has not meaningfully moved', () => {
    const note = detectBodyTrendNote({
      weighIns: [{ date: '2026-08-10', weightKg: 100 }, { date: '2026-08-30', weightKg: 100.3 }],
      waistMeasurements: [{ date: '2026-08-10', waistCm: 105 }, { date: '2026-08-30', waistCm: 104.7 }],
      todayKey: TODAY,
    })
    expect(note).toBeNull()
  })

  it('says nothing without at least 2 data points in the window for both', () => {
    const note = detectBodyTrendNote({
      weighIns: [{ date: '2026-08-30', weightKg: 100 }],
      waistMeasurements: [{ date: '2026-08-10', waistCm: 105 }, { date: '2026-08-30', waistCm: 103 }],
      todayKey: TODAY,
    })
    expect(note).toBeNull()
  })

  it('produces a Swedish one-liner', () => {
    const label = bodyTrendNoteLabel({ kind: 'waist_progressing_despite_flat_weight', waistDropCm: 1.5 })
    expect(label).toContain('1,5 cm')
    expect(label).toContain('Vågen')
  })
})
