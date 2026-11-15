import { describe, expect, it } from 'vitest'
import { singleUnitLabel } from './index.ts'

describe('singleUnitLabel', () => {
  it.each([
    ['1 alfajor', 'alfajor'],
    ['1 unidad', 'unidad'],
    ['1 unidad (50 g)', 'unidad'],
    ['1 unidad(50 g)', 'unidad'],
    ['  1   galletita  ', 'galletita'],
    ['1 Alfajor', 'Alfajor'],
    ['1 porción', 'porción'],
  ])('"%s" da "%s"', (text, expected) => {
    expect(singleUnitLabel(text)).toBe(expected)
  })

  it.each([
    '2 galletitas',
    '1/2 taza',
    '1 taza grande',
    '30 g',
    '1',
    '10 unidades',
    '1,5 unidades',
    'una unidad',
    '1 unidad 50 g',
    '',
  ])('"%s" da null', (text) => {
    expect(singleUnitLabel(text)).toBeNull()
  })
})
