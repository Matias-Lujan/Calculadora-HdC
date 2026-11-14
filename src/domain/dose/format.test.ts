import { describe, expect, it } from 'vitest'
import { formatCarbs, formatCookingFactor, formatDose } from './format.ts'

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
