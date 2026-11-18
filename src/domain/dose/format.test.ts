import { describe, expect, it } from 'vitest'
import {
  formatCarbs,
  formatDose,
  formatDoseCompact,
  formatGrams,
  unitsWord,
  withUnitsWord,
} from './format.ts'

const NBSP = '\u00a0'

describe('formatDose (2 decimales)', () => {
  it.each([
    // toFixed(2) da "1.00" y "2.67": el binario queda apenas por debajo.
    [1.005, '1,01'],
    [2.675, '2,68'],
    [0.1 + 0.2, '0,30'],
    [8.549333333333333, '8,55'],
    [10 / 3, '3,33'],
    [2 / 3, '0,67'],
    [5, '5,00'],
    [1234.5678, '1234,57'],
  ])('%s → %s', (value, expected) => {
    expect(formatDose(value)).toBe(expected)
  })

  it('nunca muestra "-0"', () => {
    expect(formatDose(-0)).toBe('0,00')
    expect(formatDose(-0.001)).toBe('0,00')
  })

  it('redondea a 0 los restos de punto flotante', () => {
    expect(formatDose(0.1 + 0.2 - 0.3)).toBe('0,00') // 5.55e-17
  })
})

describe('formatDoseCompact (hasta 2 decimales, sin ceros de más)', () => {
  it.each([
    [7, '7'],
    [8.5, '8,5'],
    [8.546666, '8,55'],
    [8.546666666666667, '8,55'],
    [1.005, '1,01'],
    [2.675, '2,68'],
    [8.999, '9'],
    [8.995, '9'],
    [0.995, '1'],
    [9.995, '10'],
    [0, '0'],
    [0.004, '0'],
    [0.005, '0,01'],
    [0.05, '0,05'],
    [0.1, '0,1'],
    [0.1 + 0.2, '0,3'],
    [0.5, '0,5'],
    [1, '1'],
    [10, '10'],
    [10.5, '10,5'],
    [100, '100'],
    [100.05, '100,05'],
    [10 / 3, '3,33'],
    [2 / 3, '0,67'],
    [1234.5, '1234,5'],
    [1e-7, '0'],
  ])('%s → %s', (value, expected) => {
    expect(formatDoseCompact(value)).toBe(expected)
  })

  it('nunca muestra "-0"', () => {
    expect(formatDoseCompact(-0)).toBe('0')
    expect(formatDoseCompact(-0.001)).toBe('0')
    expect(formatDoseCompact(-0.004)).toBe('0')
  })

  it('redondea a 0 los restos de punto flotante', () => {
    expect(formatDoseCompact(0.1 + 0.2 - 0.3)).toBe('0') // 5.55e-17
  })

  it('does not trim the zeros of the whole part', () => {
    expect(formatDoseCompact(10)).toBe('10')
    expect(formatDoseCompact(20.001)).toBe('20')
    expect(formatDoseCompact(100.004)).toBe('100')
    expect(formatDoseCompact(1000)).toBe('1000')
  })

  it('a value toFixed writes with an exponent is left as it is', () => {
    expect(formatDoseCompact(1e30)).toBe(formatDose(1e30))
  })

  it('never trims the zero of an exponent ("1,5e+30" is not "1,5e+3")', () => {
    // Reachable with an absurd applied dose or ratio (60 ÷ 4e-29 in the
    // example of Configuración): the number shown must not change.
    for (const value of [1.5e30, 2.5e40, 1.25e100, 60 / 4e-29]) {
      expect(formatDoseCompact(value)).toBe(formatDose(value))
    }
  })

  it('is formatDose without the trailing zeros, for many values', () => {
    for (let hundredths = 0; hundredths <= 5_000; hundredths += 7) {
      const value = hundredths / 100
      const compact = formatDoseCompact(value)
      expect(compact).toMatch(/^\d+(,\d?[1-9])?$/)
      expect(formatDose(value).startsWith(compact)).toBe(true)
      expect(Number(compact.replace(',', '.'))).toBe(
        Number(formatDose(value).replace(',', '.')),
      )
    }
  })
})

describe('unitsWord y withUnitsWord', () => {
  it('"1" exactly is one unit', () => {
    expect(unitsWord('1')).toBe('unidad')
    expect(withUnitsWord('1')).toBe(`1${NBSP}unidad`)
  })

  it.each([
    '1,00',
    '1,0',
    '01',
    '0,5',
    '0',
    '0,00',
    '2',
    '8,55',
    '10',
    '1.000',
  ])('%j is "unidades"', (text) => {
    expect(unitsWord(text)).toBe('unidades')
    expect(withUnitsWord(text)).toBe(`${text}${NBSP}unidades`)
  })

  it('the space never breaks: U+00A0, not a plain space', () => {
    const text = withUnitsWord(formatDose(8.546666))
    expect(text).toBe('8,55\u00a0unidades')
    expect(text).not.toContain(' ')
  })

  it('with the formats of a dose', () => {
    expect(withUnitsWord(formatDose(1))).toBe(`1,00${NBSP}unidades`)
    expect(withUnitsWord(formatDoseCompact(1))).toBe(`1${NBSP}unidad`)
    expect(withUnitsWord(formatDoseCompact(1.004))).toBe(`1${NBSP}unidad`)
    expect(withUnitsWord(formatDoseCompact(1.005))).toBe(`1,01${NBSP}unidades`)
    expect(withUnitsWord(formatDoseCompact(0.5))).toBe(`0,5${NBSP}unidades`)
    expect(withUnitsWord(formatDoseCompact(0))).toBe(`0${NBSP}unidades`)
  })

  it('never says "U"', () => {
    for (const text of ['1', '0', '7', '8,55']) {
      expect(withUnitsWord(text)).not.toMatch(/\bU\b/)
    }
  })
})

describe('formatCarbs (1 decimal)', () => {
  it.each([
    [0.1 + 0.2, '0,3'],
    [1.05, '1,1'],
    [1.25, '1,3'],
    [24.24, '24,2'],
    [24.25, '24,3'],
    [128.24, '128,2'],
    [74.99999999999999, '75,0'],
    [0, '0,0'],
    [1e-7, '0,0'],
  ])('%s → %s', (value, expected) => {
    expect(formatCarbs(value)).toBe(expected)
  })
})

describe('formatGrams (hasta 1 decimal, sin ",0")', () => {
  it.each([
    [250, '250'],
    [22.5, '22,5'],
    [0.5 * 45, '22,5'],
    [4.75, '4,8'],
    [1.05, '1,1'],
    [1.25, '1,3'],
    [0.1 + 0.2, '0,3'],
    [0.1, '0,1'],
    [0.05, '0,1'],
    [0.04, '0'],
    [249.96, '250'],
    [249.94, '249,9'],
    [250.25, '250,3'],
    [1500, '1500'],
    [12345.6, '12345,6'],
    [74.99999999999999, '75'],
    [1e-7, '0'],
    [0, '0'],
  ])('%s → %s', (value, expected) => {
    expect(formatGrams(value)).toBe(expected)
  })

  it('nunca muestra "-0"', () => {
    expect(formatGrams(-0)).toBe('0')
    expect(formatGrams(-0.04)).toBe('0')
  })

  it('no usa separador de miles', () => {
    expect(formatGrams(1234567)).toBe('1234567')
  })
})

describe('formatGrams: bordes', () => {
  it.each([
    // Rounding up to a whole number drops the decimal ("1", not "1,0").
    [0.95, '1'],
    [9.95, '10'],
    [99.95, '100'],
    [999.95, '1000'],
    // Half up on the decimal value that is shown, not the binary one.
    [0.15, '0,2'],
    [0.45, '0,5'],
    [2.675, '2,7'],
    [1.005, '1'],
    [0.25, '0,3'],
    // Just below half rounds down.
    [0.049999, '0'],
    [22.44999, '22,4'],
    // Very small values (exponent form in String()).
    [5e-7, '0'],
    [0.05000000000000001, '0,1'],
    // Big values without separator nor exponent.
    [123456789.95, '123456790'],
    [1e20, '100000000000000000000'],
  ])('%s → %s', (value, expected) => {
    expect(formatGrams(value)).toBe(expected)
  })

  it('never shows ",0" nor "-0" on values that round to a whole number', () => {
    for (let tenths = 0; tenths <= 50_000; tenths += 7) {
      const text = formatGrams(tenths / 10)
      expect(text).not.toMatch(/,0$/)
      expect(text).not.toMatch(/^-/)
      expect(text).not.toContain('.')
      expect(text).toMatch(/^\d+(,\d)?$/)
    }
  })

  it('agrees with formatCarbs on the rounded value (only the ",0" differs)', () => {
    for (const value of [0, 0.04, 0.05, 1.005, 2.675, 22.5, 249.96, 1500]) {
      expect(formatGrams(value)).toBe(formatCarbs(value).replace(/,0$/, ''))
    }
  })
})

describe('formatGrams: rounds the decimal value it receives (spec §8.2)', () => {
  // The rule rounds the shortest decimal form of the number, not value × 10
  // in binary: Math.round(26.549999999999997 * 10) gives 266 (the product
  // rounds up to 265.5 in binary), which would show "26,6".
  it.each([
    [26.549999999999997, '26,5'],
    [51.349999999999994, '51,3'],
    [28.049999999999997, '28'],
  ])('%s → %s', (value, expected) => {
    expect(formatGrams(value)).toBe(expected)
  })
})
