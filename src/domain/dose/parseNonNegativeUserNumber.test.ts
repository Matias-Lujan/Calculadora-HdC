import { describe, expect, it } from 'vitest'
import { parseNonNegativeUserNumber } from './parseNonNegativeUserNumber.ts'
import { parsePositiveUserNumber } from './parsePositiveUserNumber.ts'

describe('parseNonNegativeUserNumber', () => {
  it.each(['', '   ', '\u00a0', ' \u00a0 ', '\t', '\n'])(
    '%j → REQUIRED',
    (text) => {
      expect(parseNonNegativeUserNumber(text)).toEqual({ error: 'REQUIRED' })
    },
  )

  it.each([
    '12,',
    ',5',
    ',',
    '.',
    '8.5',
    '1.50',
    '-1',
    '+1',
    '-0',
    'abc',
    '8,5 U',
    '12 5',
    '1e3',
    'Infinity',
    'NaN',
    '9'.repeat(400),
    '1' + '0'.repeat(309),
  ])('%j → INVALID_NUMBER', (text) => {
    expect(parseNonNegativeUserNumber(text)).toEqual({
      error: 'INVALID_NUMBER',
    })
  })

  it.each([
    ['0', 0],
    ['0,0', 0],
    ['000', 0],
    [' 0 ', 0],
    ['0,0001', 0.0001],
    ['8', 8],
    ['8,5', 8.5],
    ['1.234,5', 1234.5],
    ['8,546666666666667', 8.546666666666667],
    ['1' + '0'.repeat(308), 1e308],
  ])('%j → %s', (text, value) => {
    expect(parseNonNegativeUserNumber(text)).toEqual({ value })
  })

  it('does not round', () => {
    expect(parseNonNegativeUserNumber('0,30000000000000004')).toEqual({
      value: 0.1 + 0.2,
    })
  })

  it('a number that underflows to 0 is the value 0 (0 is valid here)', () => {
    expect(parseNonNegativeUserNumber(`0,${'0'.repeat(400)}1`)).toEqual({
      value: 0,
    })
  })

  it('REQUIRED only for blank text', () => {
    expect(parseNonNegativeUserNumber(' x ')).toEqual({
      error: 'INVALID_NUMBER',
    })
  })

  it('agrees with parsePositiveUserNumber except that 0 is valid', () => {
    const texts = [
      '',
      ' ',
      '0',
      '0,0',
      '0,1',
      '12,5',
      '1.500',
      '12,',
      ',5',
      '12.5',
      '-5',
      'abc',
    ]
    for (const text of texts) {
      const positive = parsePositiveUserNumber(text)
      const nonNegative = parseNonNegativeUserNumber(text)
      if ('error' in positive && positive.error === 'NOT_POSITIVE') {
        expect(nonNegative).toEqual({ value: 0 })
      } else {
        expect(nonNegative).toEqual(positive)
      }
    }
  })
})

// --- Edge cases added by the tester ---

describe('parseNonNegativeUserNumber, edge cases', () => {
  it.each([
    ['0,000', 0],
    ['00,5', 0.5],
    ['01', 1],
    ['1.000', 1000],
    ['1.000.000,5', 1000000.5],
    [' 0 ', 0],
    // The smallest number above 0 is a value, not rounded to 0.
    [`0,${'0'.repeat(323)}5`, 5e-324],
  ])('%j → %s', (text, value) => {
    expect(parseNonNegativeUserNumber(text)).toEqual({ value })
  })

  it.each(['-0,0', '0,', '-0,5', '0,5-', '1,7976931348623157e308', '0x10'])(
    '%j → INVALID_NUMBER',
    (text) => {
      expect(parseNonNegativeUserNumber(text)).toEqual({
        error: 'INVALID_NUMBER',
      })
    },
  )

  it('0 is never -0', () => {
    for (const text of ['0', '0,0', '000', `0,${'0'.repeat(400)}1`]) {
      const result = parseNonNegativeUserNumber(text)
      expect('value' in result && Object.is(result.value, -0)).toBe(false)
    }
  })

  it('a valid result is never negative nor non-finite', () => {
    const texts = ['0', '0,1', '8,55', '1.234,5', '9'.repeat(308), '1,5']
    for (const text of texts) {
      const result = parseNonNegativeUserNumber(text)
      if (!('value' in result)) throw new Error(`expected a value: ${text}`)
      expect(result.value).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(result.value)).toBe(true)
    }
  })
})
