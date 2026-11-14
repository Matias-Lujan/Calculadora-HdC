import { describe, expect, it } from 'vitest'
import {
  MAX_CARBS_PER_100G,
  isValidCarbsPer100g,
  parseCarbsPer100g,
} from './carbsPer100g.ts'

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
