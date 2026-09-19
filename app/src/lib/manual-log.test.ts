import { describe, it, expect } from 'vitest'
import { sanitizeManualExercises } from './manual-log'

describe('sanitizeManualExercises', () => {
  it('keeps a valid exercise with a weight', () => {
    expect(sanitizeManualExercises([{ name: 'Svingar', sets: 3, reps: 10, weightKg: 24 }]))
      .toEqual([{ name: 'Svingar', sets: 3, reps: 10, weightKg: 24 }])
  })

  it('allows a null weight (bodyweight exercise)', () => {
    expect(sanitizeManualExercises([{ name: 'Burpees', sets: 4, reps: 15, weightKg: null }]))
      .toEqual([{ name: 'Burpees', sets: 4, reps: 15, weightKg: null }])
  })

  it('treats a missing weightKg field the same as null', () => {
    expect(sanitizeManualExercises([{ name: 'Burpees', sets: 4, reps: 15 }]))
      .toEqual([{ name: 'Burpees', sets: 4, reps: 15, weightKg: null }])
  })

  it('drops an entry with no name', () => {
    expect(sanitizeManualExercises([{ sets: 3, reps: 10, weightKg: 20 }])).toEqual([])
  })

  it('drops an entry with a non-numeric sets/reps', () => {
    expect(sanitizeManualExercises([{ name: 'Svingar', sets: 'three', reps: 10, weightKg: 20 }])).toEqual([])
  })

  it('clamps an out-of-range weight instead of dropping the exercise', () => {
    expect(sanitizeManualExercises([{ name: 'Marklyft', sets: 3, reps: 5, weightKg: 9999 }]))
      .toEqual([{ name: 'Marklyft', sets: 3, reps: 5, weightKg: 500 }])
    expect(sanitizeManualExercises([{ name: 'Marklyft', sets: 3, reps: 5, weightKg: -10 }]))
      .toEqual([{ name: 'Marklyft', sets: 3, reps: 5, weightKg: 0 }])
  })

  it('caps the array at 12 entries', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Ex${i}`, sets: 1, reps: 1, weightKg: null }))
    expect(sanitizeManualExercises(many)).toHaveLength(12)
  })

  it('trims and caps an overlong name', () => {
    const result = sanitizeManualExercises([{ name: `  ${'x'.repeat(100)}  `, sets: 1, reps: 1, weightKg: null }])
    expect(result[0].name).toHaveLength(60)
  })

  it('returns an empty array for non-array input', () => {
    expect(sanitizeManualExercises(null)).toEqual([])
    expect(sanitizeManualExercises('not an array')).toEqual([])
    expect(sanitizeManualExercises(undefined)).toEqual([])
  })

  it('drops malformed entries but keeps the valid ones in the same call', () => {
    expect(sanitizeManualExercises([
      { name: 'Svingar', sets: 3, reps: 10, weightKg: 24 },
      { sets: 3, reps: 10 }, // no name
      null,
      { name: 'Goblet Squat', sets: 4, reps: 8, weightKg: 20 },
    ])).toEqual([
      { name: 'Svingar', sets: 3, reps: 10, weightKg: 24 },
      { name: 'Goblet Squat', sets: 4, reps: 8, weightKg: 20 },
    ])
  })
})
