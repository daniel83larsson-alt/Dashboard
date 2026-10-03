import { describe, it, expect } from 'vitest'
import { nextFocusIndex } from './focus-trap'

describe('nextFocusIndex', () => {
  it('wraps from last to first on Tab and first to last on Shift+Tab', () => {
    expect(nextFocusIndex(3, 4, false)).toBe(0)
    expect(nextFocusIndex(0, 4, true)).toBe(3)
  })
  it('lets the browser handle Tab in the middle of the dialog', () => {
    expect(nextFocusIndex(1, 4, false)).toBeNull()
    expect(nextFocusIndex(2, 4, true)).toBeNull()
  })
  it('pulls focus into the dialog when it is outside or on the panel itself', () => {
    expect(nextFocusIndex(-1, 4, false)).toBe(0)
    expect(nextFocusIndex(-1, 4, true)).toBe(3)
  })
  it('keeps focus on the panel when there is nothing focusable', () => {
    expect(nextFocusIndex(-1, 0, false)).toBe(-1)
  })
})
