import { describe, it, expect } from 'vitest'
import { parseIsoDuration, mapPolarSport } from './polar'

describe('parseIsoDuration', () => {
  it('parses hours, minutes, and seconds', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723)
  })

  it('parses minutes and seconds only', () => {
    expect(parseIsoDuration('PT45M30S')).toBe(2730)
  })

  it('parses seconds only', () => {
    expect(parseIsoDuration('PT90S')).toBe(90)
  })

  it('parses hours only', () => {
    expect(parseIsoDuration('PT2H')).toBe(7200)
  })

  it('returns 0 for an unparseable string', () => {
    expect(parseIsoDuration('garbage')).toBe(0)
  })
})

describe('mapPolarSport', () => {
  it('maps common endurance sports', () => {
    expect(mapPolarSport('RUNNING')).toBe('Run')
    expect(mapPolarSport('ROAD_BIKING')).toBe('Ride')
    expect(mapPolarSport('SWIMMING')).toBe('Swim')
    expect(mapPolarSport('INDOOR_ROWING')).toBe('Rowing')
  })

  it('maps strength/HIIT variants', () => {
    expect(mapPolarSport('STRENGTH_TRAINING')).toBe('WeightTraining')
    expect(mapPolarSport('HIGH_INTENSITY_INTERVAL_TRAINING')).toBe('HIIT')
    expect(mapPolarSport('CROSSFIT')).toBe('Crossfit')
  })

  it('falls back to Workout for an unrecognized sport', () => {
    expect(mapPolarSport('SOMETHING_NEW_POLAR_ADDS_LATER')).toBe('Workout')
  })
})
