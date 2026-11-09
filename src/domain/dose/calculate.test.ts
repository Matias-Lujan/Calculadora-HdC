import { describe, expect, it } from 'vitest'
import { calculateMeal } from './calculate.ts'
import { formatCarbs, formatDose } from './format.ts'
import type {
  DoseSettings,
  ItemErrorCode,
  ItemSuccess,
  MealFailure,
  MealItemInput,
  MealResult,
  MealSuccess,
} from './types.ts'

// Test groups follow the list in docs/spec.md §8.6.

const settings: DoseSettings = {
  carbRatioGPerUnit: 15,
  maxDoseWarningUnits: null,
  maxItemGramsWarning: 500,
}

function asEaten(
  carbsPer100g: number | null,
  grams: number | null,
): MealItemInput {
  return {
    foodState: 'as_eaten',
    carbsPer100g,
    cookingFactor: null,
    unitWeightG: null,
    quantityMode: 'grams',
    quantity: grams,
  }
}

function rawCooked(
  carbsPer100g: number | null,
  cookingFactor: number | null,
  cookedGrams: number | null,
): MealItemInput {
  return {
    foodState: 'raw_cooked',
    carbsPer100g,
    cookingFactor,
    unitWeightG: null,
    quantityMode: 'grams',
    quantity: cookedGrams,
  }
}

function byUnits(
  carbsPer100g: number | null,
  unitWeightG: number | null,
  units: number | null,
): MealItemInput {
  return {
    foodState: 'as_eaten',
    carbsPer100g,
    cookingFactor: null,
    unitWeightG,
    quantityMode: 'units',
    quantity: units,
  }
}

function expectSuccess(result: MealResult): MealSuccess {
  if (!result.ok) {
    throw new Error(`Expected success, got ${JSON.stringify(result)}`)
  }
  return result
}

function expectFailure(result: MealResult): MealFailure {
  if (result.ok) {
    throw new Error(`Expected failure, got ${JSON.stringify(result)}`)
  }
  return result
}

function onlyItem(result: MealResult): ItemSuccess {
  const [item] = expectSuccess(result).items
  if (item === undefined) throw new Error('Expected one item')
  return item
}

function itemErrors(result: MealResult, index = 0): ItemErrorCode[] {
  const item = expectFailure(result).items[index]
  if (item === undefined || item.ok) {
    throw new Error(`Expected item ${index} to fail`)
  }
  return item.errors
}

describe('caso feliz', () => {
  it('calcula un ítem as_eaten', () => {
    const result = expectSuccess(calculateMeal([asEaten(20.2, 120)], settings))

    expect(result.items[0]).toEqual({
      ok: true,
      grams: 120,
      effectiveCarbsPer100g: 20.2,
      carbsG: expect.closeTo(24.24, 10),
      warnings: [],
    })
    expect(result.totalCarbsG).toBeCloseTo(24.24, 10)
    expect(result.doseUnits).toBeCloseTo(24.24 / 15, 10)
    expect(result.warnings).toEqual([])
  })

  it('calcula un ítem raw_cooked dividiendo por el factor', () => {
    const item = onlyItem(calculateMeal([rawCooked(78, 2.6, 250)], settings))

    expect(item.grams).toBe(250)
    expect(item.effectiveCarbsPer100g).toBeCloseTo(30, 10)
    expect(item.carbsG).toBeCloseTo(75, 10)
  })

  it('calcula un ítem por unidades', () => {
    const item = onlyItem(calculateMeal([byUnits(58, 50, 1)], settings))

    expect(item.grams).toBe(50)
    expect(item.effectiveCarbsPer100g).toBe(58)
    expect(item.carbsG).toBeCloseTo(29, 10)
  })

  it('reproduce exactamente el desglose del ejemplo de spec §8.3', () => {
    const result = expectSuccess(
      calculateMeal(
        [
          rawCooked(78, 2.6, 250), // arroz
          asEaten(20.2, 120), // banana
          byUnits(58, 50, 1), // alfajor
        ],
        settings,
      ),
    )

    const shown = result.items.map((item) => ({
      grams: item.grams,
      effective: formatCarbs(item.effectiveCarbsPer100g),
      carbs: formatCarbs(item.carbsG),
    }))
    expect(shown).toEqual([
      { grams: 250, effective: '30,0', carbs: '75,0' },
      { grams: 120, effective: '20,2', carbs: '24,2' },
      { grams: 50, effective: '58,0', carbs: '29,0' },
    ])
    expect(formatCarbs(result.totalCarbsG)).toBe('128,2')
    expect(formatDose(result.doseUnits)).toBe('8,55')
  })
})

describe('cantidades', () => {
  it('gramos = 0 da error', () => {
    expect(itemErrors(calculateMeal([asEaten(50, 0)], settings))).toEqual([
      'INVALID_QUANTITY',
    ])
  })

  it('gramos negativos dan error', () => {
    expect(itemErrors(calculateMeal([asEaten(50, -10)], settings))).toEqual([
      'INVALID_QUANTITY',
    ])
  })

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['vacío', null],
  ])('gramos %s dan error', (_label, grams) => {
    expect(itemErrors(calculateMeal([asEaten(50, grams)], settings))).toEqual([
      'INVALID_QUANTITY',
    ])
  })

  it('unidades = 0 da error', () => {
    expect(itemErrors(calculateMeal([byUnits(58, 50, 0)], settings))).toEqual([
      'INVALID_QUANTITY',
    ])
  })

  it.each([
    ['negativas', -1],
    ['NaN', NaN],
    ['vacías', null],
  ])('unidades %s dan error', (_label, units) => {
    expect(
      itemErrors(calculateMeal([byUnits(58, 50, units)], settings)),
    ).toEqual(['INVALID_QUANTITY'])
  })

  it('acepta unidades fraccionarias (0,5)', () => {
    const item = onlyItem(calculateMeal([byUnits(58, 50, 0.5)], settings))

    expect(item.grams).toBe(25)
    expect(item.carbsG).toBeCloseTo(14.5, 10)
  })

  it('calcula bien cantidades muy chicas (0,1 g)', () => {
    const item = onlyItem(calculateMeal([asEaten(50, 0.1)], settings))

    expect(item.carbsG).toBeCloseTo(0.05, 12)
  })
})

describe('factor de cocción', () => {
  it('ausente en raw_cooked da error', () => {
    expect(
      itemErrors(calculateMeal([rawCooked(78, null, 250)], settings)),
    ).toEqual(['MISSING_COOKING_FACTOR'])
  })

  it.each([
    ['0', 0],
    ['negativo', -2.5],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('factor %s da error', (_label, factor) => {
    expect(
      itemErrors(calculateMeal([rawCooked(78, factor, 250)], settings)),
    ).toEqual(['INVALID_COOKING_FACTOR'])
  })

  it('en as_eaten el factor se ignora, aunque sea inválido', () => {
    for (const factor of [2.5, -1, NaN]) {
      const input: MealItemInput = {
        ...asEaten(20, 100),
        cookingFactor: factor,
      }
      const item = onlyItem(calculateMeal([input], settings))

      expect(item.effectiveCarbsPer100g).toBe(20)
      expect(item.carbsG).toBe(20)
      expect(item.warnings).toEqual([])
    }
  })

  it('factor < 1 con HC alto da EFFECTIVE_CARBS_OVER_100', () => {
    // 78 ÷ 0,5 = 156 g por 100 g: físicamente imposible.
    expect(
      itemErrors(calculateMeal([rawCooked(78, 0.5, 100)], settings)),
    ).toEqual(['EFFECTIVE_CARBS_OVER_100'])
  })

  it('HC 100 con factor 1 da exactamente 100 efectivo, sin error', () => {
    const item = onlyItem(calculateMeal([rawCooked(100, 1, 50)], settings))

    expect(item.effectiveCarbsPer100g).toBe(100)
  })

  it.each([
    ['menor a 1', 0.8],
    ['mayor a 4', 4.5],
  ])('factor %s da advertencia', (_label, factor) => {
    const item = onlyItem(calculateMeal([rawCooked(50, factor, 100)], settings))

    expect(item.warnings).toEqual(['COOKING_FACTOR_UNUSUAL'])
  })

  it.each([1, 2.6, 4])('factor %s no da advertencia', (factor) => {
    const item = onlyItem(calculateMeal([rawCooked(50, factor, 100)], settings))

    expect(item.warnings).toEqual([])
  })

  it('no permite cargar por unidades un alimento raw_cooked', () => {
    const input: MealItemInput = {
      ...rawCooked(75, 2.5, 2),
      quantityMode: 'units',
      unitWeightG: 50,
    }

    expect(itemErrors(calculateMeal([input], settings))).toEqual([
      'UNITS_NOT_ALLOWED_FOR_RAW_COOKED',
    ])
  })
})

describe('HC/100 g', () => {
  it('0 es válido y da HC 0', () => {
    const result = expectSuccess(calculateMeal([asEaten(0, 200)], settings))

    expect(result.items[0]?.carbsG).toBe(0)
    expect(result.totalCarbsG).toBe(0)
    expect(result.doseUnits).toBe(0)
  })

  it('100 es válido', () => {
    expect(onlyItem(calculateMeal([asEaten(100, 30)], settings)).carbsG).toBe(
      30,
    )
  })

  it.each([
    ['mayor a 100', 100.1],
    ['negativo', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['vacío', null],
  ])('HC %s da error', (_label, carbs) => {
    expect(itemErrors(calculateMeal([asEaten(carbs, 100)], settings))).toEqual([
      'INVALID_CARBS',
    ])
  })
})

describe('peso por unidad', () => {
  it.each([
    ['ausente', null],
    ['0', 0],
    ['negativo', -50],
    ['NaN', NaN],
  ])('peso %s con unidades da error', (_label, unitWeight) => {
    expect(
      itemErrors(calculateMeal([byUnits(58, unitWeight, 1)], settings)),
    ).toEqual(['MISSING_UNIT_WEIGHT'])
  })

  it('en modo gramos el peso por unidad se ignora', () => {
    const input: MealItemInput = { ...asEaten(58, 50), unitWeightG: -1 }

    expect(onlyItem(calculateMeal([input], settings)).grams).toBe(50)
  })
})

describe('ratio', () => {
  it.each([
    ['0', 0],
    ['negativo', -15],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('ratio %s da error, sin dosis', (_label, ratio) => {
    const result = expectFailure(
      calculateMeal([asEaten(50, 100)], {
        ...settings,
        carbRatioGPerUnit: ratio,
      }),
    )

    expect(result.errors).toEqual(['INVALID_RATIO'])
    expect(result).not.toHaveProperty('doseUnits')
    // Item breakdowns do not depend on the ratio, so they are still there.
    expect(result.items[0]?.ok).toBe(true)
  })

  it('acepta un ratio no entero (12,5)', () => {
    const result = expectSuccess(
      calculateMeal([asEaten(50, 100)], {
        ...settings,
        carbRatioGPerUnit: 12.5,
      }),
    )

    expect(result.doseUnits).toBe(4)
  })
})

describe('comida', () => {
  it('sin ítems da error', () => {
    expect(expectFailure(calculateMeal([], settings)).errors).toEqual([
      'EMPTY_MEAL',
    ])
  })

  it('con un ítem inválido no devuelve dosis e informa cuál falló', () => {
    const result = expectFailure(
      calculateMeal(
        [asEaten(50, 100), asEaten(50, null), asEaten(20, 100)],
        settings,
      ),
    )

    expect(result).not.toHaveProperty('doseUnits')
    expect(result).not.toHaveProperty('totalCarbsG')
    expect(result.errors).toEqual([])
    expect(result.items.map((item) => item.ok)).toEqual([true, false, true])
    expect(result.items[1]).toEqual({ ok: false, errors: ['INVALID_QUANTITY'] })
  })

  it('informa todos los errores de un mismo ítem', () => {
    expect(
      itemErrors(calculateMeal([rawCooked(null, null, null)], settings)),
    ).toEqual(['INVALID_QUANTITY', 'INVALID_CARBS', 'MISSING_COOKING_FACTOR'])
  })

  it('el mismo alimento dos veces suma bien', () => {
    const banana = asEaten(20.2, 120)
    const result = expectSuccess(calculateMeal([banana, banana], settings))

    expect(result.items).toHaveLength(2)
    expect(result.totalCarbsG).toBeCloseTo(48.48, 10)
  })
})

describe('umbrales', () => {
  it('gramos iguales al umbral no advierten', () => {
    expect(
      onlyItem(calculateMeal([asEaten(10, 500)], settings)).warnings,
    ).toEqual([])
  })

  it('gramos justo por encima del umbral advierten', () => {
    expect(
      onlyItem(calculateMeal([asEaten(10, 500.1)], settings)).warnings,
    ).toEqual(['ITEM_GRAMS_ABOVE_THRESHOLD'])
  })

  it('el umbral de gramos se compara contra los gramos de las unidades', () => {
    // 11 unidades × 50 g = 550 g.
    expect(
      onlyItem(calculateMeal([byUnits(58, 50, 11)], settings)).warnings,
    ).toEqual(['ITEM_GRAMS_ABOVE_THRESHOLD'])
  })

  it('una dosis igual al umbral no advierte', () => {
    // 75 g ÷ 15 = 5 U.
    const result = expectSuccess(
      calculateMeal([asEaten(75, 100)], {
        ...settings,
        maxDoseWarningUnits: 5,
      }),
    )

    expect(result.doseUnits).toBe(5)
    expect(result.warnings).toEqual([])
  })

  it('una dosis justo por encima del umbral advierte', () => {
    const result = expectSuccess(
      calculateMeal([asEaten(75, 100)], {
        ...settings,
        maxDoseWarningUnits: 4.99,
      }),
    )

    expect(result.warnings).toEqual(['DOSE_ABOVE_THRESHOLD'])
  })

  it('sin umbral de dosis configurado no advierte', () => {
    const result = expectSuccess(
      calculateMeal([asEaten(100, 450), asEaten(100, 450)], settings),
    )

    expect(result.doseUnits).toBe(60)
    expect(result.warnings).toEqual([])
  })
})

describe('precisión', () => {
  it('no redondea el resultado', () => {
    // 10 g ÷ 3 = 3,333… U, sin cortar decimales.
    const result = expectSuccess(
      calculateMeal([asEaten(10, 100)], { ...settings, carbRatioGPerUnit: 3 }),
    )

    expect(result.doseUnits).toBe(10 / 3)
  })

  it('no redondea valores intermedios', () => {
    // 50 ÷ 3 = 16,666… g por 100 g; redondear antes daría otro total.
    const item = onlyItem(calculateMeal([rawCooked(50, 3, 100)], settings))

    expect(item.effectiveCarbsPer100g).toBe(50 / 3)
    expect(item.carbsG).toBe((100 * (50 / 3)) / 100)
  })

  it('un total con muchos ítems no acumula errores visibles', () => {
    // 100 ítems de 0,1 g de HC: en binario la suma no da 10 exacto.
    const items = Array.from({ length: 100 }, () => asEaten(10, 1))
    const result = expectSuccess(calculateMeal(items, settings))

    expect(result.totalCarbsG).toBeCloseTo(10, 10)
    expect(formatCarbs(result.totalCarbsG)).toBe('10,0')
    expect(formatDose(result.doseUnits)).toBe('0,67')
  })
})

describe('inmutabilidad', () => {
  function deepFreeze<T>(value: T): T {
    if (typeof value === 'object' && value !== null) {
      for (const nested of Object.values(value)) deepFreeze(nested)
      Object.freeze(value)
    }
    return value
  }

  it('no modifica los objetos que recibe', () => {
    const items = [
      rawCooked(78, 2.6, 250),
      asEaten(20.2, 120),
      byUnits(58, 50, 1),
      asEaten(null, 0),
    ]
    const config = { ...settings, maxDoseWarningUnits: 1 }
    const before = structuredClone({ items, config })

    // Frozen objects throw on any write in strict mode (ES modules).
    expect(() =>
      calculateMeal(deepFreeze(items), deepFreeze(config)),
    ).not.toThrow()
    expect({ items, config }).toEqual(before)
  })
})
