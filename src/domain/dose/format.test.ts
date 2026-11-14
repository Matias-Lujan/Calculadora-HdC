import { describe, expect, it } from 'vitest'
import {
  formatCarbs,
  formatCookingFactor,
  formatDose,
  formatGrams,
} from './format.ts'

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

describe('formatCookingFactor (2 decimales)', () => {
  it.each([
    [1.005, '1,01'],
    [2.675, '2,68'],
    [8 / 3, '2,67'],
    [3, '3,00'],
    [0.1 + 0.2, '0,30'],
    [0.004, '0,00'],
  ])('%s → %s', (value, expected) => {
    expect(formatCookingFactor(value)).toBe(expected)
  })

  it('nunca muestra "-0"', () => {
    expect(formatCookingFactor(-0)).toBe('0,00')
  })
})

describe('formatCookingFactor: bordes', () => {
  it.each([
    [1, '1,00'],
    [4, '4,00'],
    [0.995, '1,00'],
    [1.234, '1,23'],
    [2.6, '2,60'],
    [10.005, '10,01'],
    [12345.678, '12345,68'],
    [1e-7, '0,00'],
  ])('%s → %s', (value, expected) => {
    expect(formatCookingFactor(value)).toBe(expected)
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
