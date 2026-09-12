import { describe, it, expect } from 'vitest'
import { dayCalorieStatus } from './day-calorie-status'

describe('dayCalorieStatus', () => {
  it('is goal_met when eaten is at or under the budget', () => {
    expect(dayCalorieStatus(2000, 2151, 2900)).toBe('goal_met')
    expect(dayCalorieStatus(2151, 2151, 2900)).toBe('goal_met')
  })

  it('is under_burned when the budget was missed but eaten is still under what was burned (Daniel: still a real deficit day)', () => {
    expect(dayCalorieStatus(2590, 2151, 3484)).toBe('under_burned')
  })

  it('is over_burned when eaten exceeds what was burned that day', () => {
    expect(dayCalorieStatus(3025, 2151, 2899)).toBe('over_burned')
  })

  it('is over_burned exactly at the boundary plus one', () => {
    expect(dayCalorieStatus(2900, 2151, 2899)).toBe('over_burned')
  })

  it('is under_burned exactly at the burned boundary', () => {
    expect(dayCalorieStatus(2899, 2151, 2899)).toBe('under_burned')
  })
})
