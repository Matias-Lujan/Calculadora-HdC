import { describe, expect, it } from 'vitest'
import { labelCarbsPer100g } from './index.ts'

function perPortion(
  carbsG: number | null,
  portionG: number | null,
  fiberG: number | null = null,
) {
  return labelCarbsPer100g({ basis: 'per_portion', carbsG, portionG, fiberG })
}

function per100g(carbsG: number | null, fiberG: number | null = null) {
  return labelCarbsPer100g({
    basis: 'per_100g',
    carbsG,
    portionG: null,
    fiberG,
  })
}

describe('labelCarbsPer100g, por porción', () => {
  it('38 g de HC en una porción de 50 g dan exactamente 76', () => {
    expect(perPortion(38, 50)).toEqual({ ok: true, carbsPer100g: 76 })
  })

  it('no redondea: 10 g en 30 g da 33,333…', () => {
    expect(perPortion(10, 30)).toEqual({
      ok: true,
      carbsPer100g: (10 / 30) * 100,
    })
  })

  it('resta la fibra antes de pasar a 100 g', () => {
    expect(perPortion(38, 50, 3)).toEqual({
      ok: true,
      carbsPer100g: ((38 - 3) / 50) * 100,
    })
  })

  it('fibra 0 y fibra vacía dan lo mismo que sin fibra', () => {
    expect(perPortion(38, 50, 0)).toEqual(perPortion(38, 50))
    expect(perPortion(38, 50, null)).toEqual({ ok: true, carbsPer100g: 76 })
  })

  it('fibra igual a los HC da 0', () => {
    expect(perPortion(5, 50, 5)).toEqual({ ok: true, carbsPer100g: 0 })
  })

  it('HC 0 es válido', () => {
    expect(perPortion(0, 30)).toEqual({ ok: true, carbsPer100g: 0 })
  })

  it('HC igual a la porción da 100', () => {
    expect(perPortion(30, 30)).toEqual({ ok: true, carbsPer100g: 100 })
  })

  it('HC mayores que la porción dan CARBS_EXCEED_PORTION', () => {
    expect(perPortion(31, 30)).toEqual({
      ok: false,
      error: 'CARBS_EXCEED_PORTION',
    })
  })

  it.each([
    ['0', 0],
    ['negativa', -30],
    ['vacía', null],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('una porción %s da INVALID_PORTION_SIZE', (_label, portion) => {
    expect(perPortion(20, portion)).toEqual({
      ok: false,
      error: 'INVALID_PORTION_SIZE',
    })
  })

  it.each([
    ['negativos', -1],
    ['vacíos', null],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('HC %s dan INVALID_CARBS', (_label, carbs) => {
    expect(perPortion(carbs, 30)).toEqual({
      ok: false,
      error: 'INVALID_CARBS',
    })
  })

  it('fibra mayor que los HC da FIBER_EXCEEDS_CARBS', () => {
    expect(perPortion(5, 50, 6)).toEqual({
      ok: false,
      error: 'FIBER_EXCEEDS_CARBS',
    })
  })

  it.each([
    ['negativa', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('fibra %s da INVALID_FIBER', (_label, fiber) => {
    expect(perPortion(20, 30, fiber)).toEqual({
      ok: false,
      error: 'INVALID_FIBER',
    })
  })

  it('precedencia: porción, después HC, después HC contra porción, después fibra', () => {
    expect(perPortion(null, null, -1)).toEqual({
      ok: false,
      error: 'INVALID_PORTION_SIZE',
    })
    expect(perPortion(null, 30, -1)).toEqual({
      ok: false,
      error: 'INVALID_CARBS',
    })
    expect(perPortion(31, 30, -1)).toEqual({
      ok: false,
      error: 'CARBS_EXCEED_PORTION',
    })
    expect(perPortion(20, 30, 21)).toEqual({
      ok: false,
      error: 'FIBER_EXCEEDS_CARBS',
    })
  })
})

describe('labelCarbsPer100g, cada 100 g', () => {
  it('devuelve los HC tal cual, sin dividir y multiplicar por 100', () => {
    // 57 / 100 * 100 es 56.99999999999999 en binario.
    expect(per100g(57)).toEqual({ ok: true, carbsPer100g: 57 })
    expect(per100g(78.3)).toEqual({ ok: true, carbsPer100g: 78.3 })
  })

  it('resta la fibra', () => {
    expect(per100g(78, 3)).toEqual({ ok: true, carbsPer100g: 75 })
  })

  it('fibra 0 y fibra vacía dan los HC tal cual', () => {
    expect(per100g(78.3, 0)).toEqual({ ok: true, carbsPer100g: 78.3 })
    expect(per100g(78.3, null)).toEqual({ ok: true, carbsPer100g: 78.3 })
  })

  it('fibra igual a los HC da 0', () => {
    expect(per100g(4, 4)).toEqual({ ok: true, carbsPer100g: 0 })
  })

  it('0 y 100 son válidos', () => {
    expect(per100g(0)).toEqual({ ok: true, carbsPer100g: 0 })
    expect(per100g(100)).toEqual({ ok: true, carbsPer100g: 100 })
  })

  it('más de 100 da CARBS_EXCEED_PORTION', () => {
    expect(per100g(100.1)).toEqual({
      ok: false,
      error: 'CARBS_EXCEED_PORTION',
    })
  })

  it.each([
    ['negativos', -1],
    ['vacíos', null],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('HC %s dan INVALID_CARBS', (_label, carbs) => {
    expect(per100g(carbs)).toEqual({ ok: false, error: 'INVALID_CARBS' })
  })

  it('la porción se ignora', () => {
    expect(
      labelCarbsPer100g({
        basis: 'per_100g',
        carbsG: 57,
        portionG: -1,
        fiberG: null,
      }),
    ).toEqual({ ok: true, carbsPer100g: 57 })
  })

  it('fibra mayor que los HC o inválida da error', () => {
    expect(per100g(5, 6)).toEqual({
      ok: false,
      error: 'FIBER_EXCEEDS_CARBS',
    })
    expect(per100g(5, -1)).toEqual({ ok: false, error: 'INVALID_FIBER' })
    expect(per100g(5, NaN)).toEqual({ ok: false, error: 'INVALID_FIBER' })
  })
})
