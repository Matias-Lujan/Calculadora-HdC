import { describe, expect, it } from 'vitest'
import { carbsPer100gFromPortion } from './portion.ts'

describe('carbsPer100gFromPortion', () => {
  it('pasa HC por porción a HC por 100 g', () => {
    // 20 g de HC en una porción de 30 g → 66,666… g por 100 g, sin redondear.
    expect(carbsPer100gFromPortion(20, 30)).toEqual({
      ok: true,
      carbsPer100g: (20 / 30) * 100,
    })
  })

  it('una porción de 100 g deja el valor igual', () => {
    expect(carbsPer100gFromPortion(12.5, 100)).toEqual({
      ok: true,
      carbsPer100g: 12.5,
    })
  })

  it('0 g de HC da 0', () => {
    expect(carbsPer100gFromPortion(0, 30)).toEqual({
      ok: true,
      carbsPer100g: 0,
    })
  })

  it('HC igual a la porción da 100', () => {
    expect(carbsPer100gFromPortion(5, 5)).toEqual({
      ok: true,
      carbsPer100g: 100,
    })
  })

  it('más HC que gramos de porción es un error de lectura', () => {
    expect(carbsPer100gFromPortion(31, 30)).toEqual({
      ok: false,
      error: 'CARBS_EXCEED_PORTION',
    })
  })

  it.each([
    ['0', 0],
    ['negativa', -30],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['vacía', null],
  ])('una porción %s da error', (_label, portion) => {
    expect(carbsPer100gFromPortion(20, portion)).toEqual({
      ok: false,
      error: 'INVALID_PORTION_SIZE',
    })
  })

  it.each([
    ['negativos', -1],
    ['NaN', NaN],
    ['vacíos', null],
  ])('HC %s dan error', (_label, carbs) => {
    expect(carbsPer100gFromPortion(carbs, 30)).toEqual({
      ok: false,
      error: 'INVALID_CARBS',
    })
  })

  it('con las dos entradas inválidas informa primero la porción', () => {
    expect(carbsPer100gFromPortion(null, null)).toEqual({
      ok: false,
      error: 'INVALID_PORTION_SIZE',
    })
  })
})
