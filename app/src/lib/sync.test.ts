import { describe, it, expect } from 'vitest'
import { syncChangedData } from './sync'

describe('syncChangedData', () => {
  it('ingen ändring → ingen omladdning', () => {
    expect(syncChangedData({ synced: 0, cleaned: 0, backfilled: 0, activitiesBackfilled: 0, reclassified: 0, zonesBackfilled: 0, wellness: { steps: 5000 } })).toBe(false)
    expect(syncChangedData({ synced: 0, cleaned: [] })).toBe(false)
  })
  it('nya pass eller bakfyllning/städning → omladdning', () => {
    expect(syncChangedData({ synced: 1 })).toBe(true)
    expect(syncChangedData({ synced: 0, zonesBackfilled: 3 })).toBe(true)
    expect(syncChangedData({ synced: 0, cleaned: 2 })).toBe(true)
    expect(syncChangedData({ synced: 0, reclassified: [{ id: 'x' }] })).toBe(true)
  })
  it('felsvar eller okänt format → ingen omladdning', () => {
    expect(syncChangedData({ error: 'Garmin not configured' })).toBe(false)
    expect(syncChangedData(null)).toBe(false)
    expect(syncChangedData('x')).toBe(false)
  })
})
