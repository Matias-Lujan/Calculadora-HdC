import { describe, expect, it } from 'vitest'
import {
  MAX_CARBS_PER_100G,
  carbsWithoutFiber,
  isValidCarbsPer100g,
  parseCarbsPer100g,
} from './carbsPer100g.ts'
import * as dose from './index.ts'

describe('parseCarbsPer100g', () => {
  it.each(['', '   ', ' ', '   ', '\t'])('%j → REQUIRED', (text) => {
    expect(parseCarbsPer100g(text)).toEqual({ error: 'REQUIRED' })
  })

  it.each([
    ['0', 0],
    ['0,0', 0],
    ['000', 0],
    ['100', 100],
    ['100,0', 100],
    ['12,5', 12.5],
    ['0,0001', 0.0001],
    [' 12,5 ', 12.5],
    ['99,9999', 99.9999],
  ])('%j → %s', (text, value) => {
    expect(parseCarbsPer100g(text)).toEqual({ value })
  })

  it('the smallest step above 100 is ABOVE_100, 100 itself is not', () => {
    expect(parseCarbsPer100g('100,00000000000002')).toEqual({
      error: 'ABOVE_100',
    })
    expect(parseCarbsPer100g('100,000')).toEqual({ value: 100 })
  })

  it('does not round: "0,3" is exactly 0.3', () => {
    expect(parseCarbsPer100g('0,3')).toEqual({ value: 0.3 })
  })

  it.each(['100,0001', '101', '1.000', '1.000,5'])('%j → ABOVE_100', (text) => {
    expect(parseCarbsPer100g(text)).toEqual({ error: 'ABOVE_100' })
  })

  it.each([
    '12,',
    ',5',
    ',',
    '12.5',
    '1.50',
    '-5',
    '+5',
    'abc',
    '12 5',
    '12g',
    '9'.repeat(400),
    'NaN',
    'Infinity',
    '1e2',
    '-0',
    '−5',
  ])('%j → INVALID_NUMBER', (text) => {
    expect(parseCarbsPer100g(text)).toEqual({ error: 'INVALID_NUMBER' })
  })
})

describe('isValidCarbsPer100g', () => {
  it.each([0, -0, 50, 100, 0.0001, 99.9999, Number.MIN_VALUE])(
    '%s is valid',
    (value) => {
      expect(isValidCarbsPer100g(value)).toBe(true)
    },
  )

  it.each([
    -0.0001,
    -Number.MIN_VALUE,
    -1,
    100.0001,
    100 + Number.EPSILON * 100,
    NaN,
    Infinity,
    -Infinity,
  ])('%s is not valid', (value) => {
    expect(isValidCarbsPer100g(value)).toBe(false)
  })

  it('the upper bound is 100', () => {
    expect(MAX_CARBS_PER_100G).toBe(100)
  })
})

describe('carbsWithoutFiber', () => {
  it('subtracts the fiber without rounding', () => {
    expect(carbsWithoutFiber(12.76, 1.3)).toBe(11.459999999999999)
    expect(carbsWithoutFiber(0.3, 0.1)).toBe(0.19999999999999998)
  })

  it.each([
    [12.5, 0, 12.5],
    [3.2, 3.2, 0],
    [0, 0, 0],
    [100, 0, 100],
    [100, 100, 0],
  ])('(%s, %s) → %s', (total, fiber, carbs) => {
    expect(carbsWithoutFiber(total, fiber)).toBe(carbs)
  })

  it('more fiber than total carbs is null', () => {
    expect(carbsWithoutFiber(2, 2.1)).toBeNull()
    expect(carbsWithoutFiber(0, 0.1)).toBeNull()
    expect(carbsWithoutFiber(2, 2 + Number.EPSILON * 2)).toBeNull()
  })

  it.each([
    [-1, 0],
    [10, -0.1],
    [-0.1, -0.2],
    [-0.1, 0],
    [NaN, 0],
    [10, NaN],
    [NaN, NaN],
    [Infinity, 0],
    [10, Infinity],
    [-Infinity, 0],
    [10, -Infinity],
    [Infinity, Infinity],
  ])('(%s, %s) is null', (total, fiber) => {
    expect(carbsWithoutFiber(total, fiber)).toBeNull()
  })

  it('a total above 100 is null, even if the subtraction would be in range', () => {
    expect(carbsWithoutFiber(100.1, 0)).toBeNull()
    expect(carbsWithoutFiber(120, 30)).toBeNull()
  })

  it('keeps the binary noise of the subtraction (white rice of the seed)', () => {
    expect(carbsWithoutFiber(28.17, 0.4)).toBe(27.770000000000003)
  })

  it('fiber above 100 is null even with a total of 100', () => {
    expect(carbsWithoutFiber(100, 100.5)).toBeNull()
  })

  it('both values above 100 are null', () => {
    expect(carbsWithoutFiber(150, 120)).toBeNull()
    expect(carbsWithoutFiber(Number.MAX_VALUE, Number.MAX_VALUE)).toBeNull()
  })

  it('negative zero is a valid zero, not a negative number', () => {
    expect(carbsWithoutFiber(-0, 0) === 0).toBe(true)
    expect(carbsWithoutFiber(0, -0) === 0).toBe(true)
  })

  it('the result never exceeds the total nor goes below 0', () => {
    for (const [total, fiber] of [
      [0.1, 0.05],
      [99.99, 0.01],
      [50, 49.9],
      [1e-7, 1e-8],
    ] as const) {
      const carbs = carbsWithoutFiber(total, fiber)
      expect(carbs).not.toBeNull()
      expect(carbs!).toBeLessThanOrEqual(total)
      expect(carbs!).toBeGreaterThanOrEqual(0)
      expect(carbs).toBe(total - fiber)
    }
  })

  it('is exported from the dose module', () => {
    expect(dose.carbsWithoutFiber).toBe(carbsWithoutFiber)
  })
})
