import { describe, expect, it } from 'vitest'
import { formatCarbs } from './format.ts'
import { sumCarbs } from './sumCarbs.ts'

describe('sumCarbs', () => {
  it('an empty list gives 0', () => {
    expect(sumCarbs([])).toBe(0)
  })

  it('one value gives the same value, exact', () => {
    expect(sumCarbs([128.24])).toBe(128.24)
    expect(sumCarbs([0])).toBe(0)
  })

  it('adds several meals', () => {
    expect(sumCarbs([75, 24.24, 29])).toBe(128.24)
    expect(sumCarbs([30, 0, 0.5])).toBe(30.5)
  })

  it('does not round: 0,1 + 0,2 stays 0,30000000000000004', () => {
    expect(sumCarbs([0.1, 0.2])).toBe(0.1 + 0.2)
    expect(formatCarbs(sumCarbs([0.1, 0.2]) ?? NaN)).toBe('0,3')
  })

  it('the rounding is done once, on the sum, not on each value', () => {
    // 0,04 three times is 0,12: each one alone shows "0,0", the sum "0,1".
    const total = sumCarbs([0.04, 0.04, 0.04])
    expect(total).toBeCloseTo(0.12, 12)
    expect(formatCarbs(total ?? NaN)).toBe('0,1')
    // 1,05 + 1,05 shows "2,1", not "2,2" (1,1 + 1,1).
    expect(formatCarbs(sumCarbs([1.05, 1.05]) ?? NaN)).toBe('2,1')
  })

  it('many values do not accumulate a visible error', () => {
    const values = Array.from({ length: 1000 }, () => 0.1)
    expect(formatCarbs(sumCarbs(values) ?? NaN)).toBe('100,0')
    const meals = Array.from({ length: 50 }, () => 128.24)
    expect(formatCarbs(sumCarbs(meals) ?? NaN)).toBe('6412,0')
  })

  it.each([
    ['NaN', [30, Number.NaN]],
    ['Infinity', [Number.POSITIVE_INFINITY]],
    ['-Infinity', [10, Number.NEGATIVE_INFINITY]],
    ['a negative value', [30, -0.1]],
    ['a negative value first', [-5, 10]],
  ])('%s gives null', (_, values) => {
    expect(sumCarbs(values)).toBeNull()
  })

  it('a sum that overflows gives null', () => {
    expect(sumCarbs([Number.MAX_VALUE, Number.MAX_VALUE])).toBeNull()
  })

  it('a large sum that does not overflow is kept', () => {
    expect(sumCarbs([1e12, 1e12])).toBe(2e12)
  })

  it('-0 counts as 0', () => {
    expect(sumCarbs([-0, 5])).toBe(5)
  })

  it('does not modify the input', () => {
    const values = [30, 20.5, 0.1]
    const before = [...values]
    sumCarbs(values)
    expect(values).toEqual(before)
  })
})
