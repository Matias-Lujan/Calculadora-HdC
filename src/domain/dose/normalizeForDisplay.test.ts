import { describe, expect, it } from 'vitest'
import { normalizeForDisplay } from './normalizeForDisplay.ts'

describe('normalizeForDisplay', () => {
  it.each([
    [28.17 - 0.4, 27.77],
    [12.76 - 1.3, 11.46],
    [0.1 + 0.2, 0.3],
    [0, 0],
    [100, 100],
    [9.5, 9.5],
    [68.4, 68.4],
    [12.345678901, 12.345678901],
  ])('%s → %s', (value, expected) => {
    expect(normalizeForDisplay(value)).toBe(expected)
  })

  it('keeps a value with 15 significant digits as it is', () => {
    expect(normalizeForDisplay(1.23456789012345)).toBe(1.23456789012345)
  })

  it.each([NaN, Infinity, -Infinity])('%s is returned as it is', (value) => {
    expect(normalizeForDisplay(value)).toBe(value)
  })
})
