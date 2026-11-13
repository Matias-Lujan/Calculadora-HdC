import { describe, expect, it } from 'vitest'
import { parsePositiveUserNumber } from './parsePositiveUserNumber.ts'

describe('parsePositiveUserNumber', () => {
  it.each(['', '   ', '\u00a0', '\t'])('%j → REQUIRED', (text) => {
    expect(parsePositiveUserNumber(text)).toEqual({ error: 'REQUIRED' })
  })

  it.each([
    '12,',
    ',5',
    ',',
    '.',
    '12.5',
    '1.50',
    '-5',
    '+5',
    'abc',
    '12 5',
    '9'.repeat(400),
  ])('%j → INVALID_NUMBER', (text) => {
    expect(parsePositiveUserNumber(text)).toEqual({ error: 'INVALID_NUMBER' })
  })

  it.each(['0', '0,0', '000', '0,000'])('%j → NOT_POSITIVE', (text) => {
    expect(parsePositiveUserNumber(text)).toEqual({ error: 'NOT_POSITIVE' })
  })

  it.each([
    ['0,0001', 0.0001],
    ['12,5', 12.5],
    ['1.500', 1500],
    [' 15 ', 15],
    ['15', 15],
    ['1.000.000', 1000000],
    ['2,675', 2.675],
  ])('%j → %s', (text, value) => {
    expect(parsePositiveUserNumber(text)).toEqual({ value })
  })
})

describe('parsePositiveUserNumber, edge cases', () => {
  it.each(['\u00a0', ' \u00a0 ', '\n', '\u2003'])(
    'only white space %j → REQUIRED',
    (text) => {
      expect(parsePositiveUserNumber(text)).toEqual({ error: 'REQUIRED' })
    },
  )

  // "0.000" is a well-grouped 0 for parseUserNumber, so it is 0, not invalid.
  it.each(['0,0000', '0.000', '000,000', ' 0 '])(
    '%j → NOT_POSITIVE',
    (text) => {
      expect(parsePositiveUserNumber(text)).toEqual({ error: 'NOT_POSITIVE' })
    },
  )

  it('a number that underflows to 0 is NOT_POSITIVE, never a value of 0', () => {
    expect(parsePositiveUserNumber(`0,${'0'.repeat(400)}1`)).toEqual({
      error: 'NOT_POSITIVE',
    })
  })

  it('the smallest representable value is valid', () => {
    expect(parsePositiveUserNumber(`0,${'0'.repeat(323)}5`)).toEqual({
      value: Number.MIN_VALUE,
    })
  })

  it('the largest finite integers are valid; one more digit is not', () => {
    expect(parsePositiveUserNumber('1' + '0'.repeat(308))).toEqual({
      value: 1e308,
    })
    expect(parsePositiveUserNumber('1' + '0'.repeat(309))).toEqual({
      error: 'INVALID_NUMBER',
    })
  })

  it.each(['1,0', '0,1', '1'])('%j is a value (> 0, not >= 1)', (text) => {
    expect('value' in parsePositiveUserNumber(text)).toBe(true)
  })

  it.each(['12,5 g', '1e3', 'Infinity', 'NaN', '1,2,3', '-0', '0x10'])(
    '%j → INVALID_NUMBER',
    (text) => {
      expect(parsePositiveUserNumber(text)).toEqual({
        error: 'INVALID_NUMBER',
      })
    },
  )

  it('REQUIRED wins over INVALID_NUMBER only for blank text', () => {
    expect(parsePositiveUserNumber(' x ')).toEqual({ error: 'INVALID_NUMBER' })
  })
})
