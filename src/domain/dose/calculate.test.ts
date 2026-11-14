import { describe, expect, it } from 'vitest'
import { CALC_VERSION, calculateMeal } from './calculate.ts'
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

describe('desborde (overflow)', () => {
  // 1 seguido de 308 ceros: un número finito que se puede tipear.
  const huge = 1e308

  function expectAllFinite(result: MealSuccess) {
    const numbers = [
      result.totalCarbsG,
      result.doseUnits,
      ...result.items.flatMap((item) => [
        item.grams,
        item.effectiveCarbsPer100g,
        item.carbsG,
      ]),
    ]
    for (const value of numbers) expect(Number.isFinite(value)).toBe(true)
  }

  it('unidades × peso por unidad que desborda da INVALID_QUANTITY', () => {
    expect(Number.isFinite(huge * 50)).toBe(false)
    expect(
      itemErrors(calculateMeal([byUnits(58, 50, huge)], settings)),
    ).toEqual(['INVALID_QUANTITY'])
    expect(
      itemErrors(calculateMeal([byUnits(58, huge, 50)], settings)),
    ).toEqual(['INVALID_QUANTITY'])
  })

  it('gramos × HC que desborda da INVALID_QUANTITY', () => {
    expect(Number.isFinite(huge * 50)).toBe(false)
    expect(itemErrors(calculateMeal([asEaten(50, huge)], settings))).toEqual([
      'INVALID_QUANTITY',
    ])
  })

  it('gramos enormes con HC chico, sin desborde, se calculan', () => {
    // 1e308 × 1 no desborda: el ítem es válido aunque sea absurdo.
    const item = onlyItem(
      calculateMeal([asEaten(1, huge)], { ...settings, carbRatioGPerUnit: 1 }),
    )
    expect(item.carbsG).toBe(huge / 100)
  })

  it('gramos enormes con HC 0 no desbordan', () => {
    const result = expectSuccess(calculateMeal([asEaten(0, huge)], settings))
    expect(result.totalCarbsG).toBe(0)
    expectAllFinite(result)
  })

  it('una suma que desborda da INVALID_QUANTITY de la comida, sin dosis', () => {
    // Cada ítem da 1,7e306 × 100 ÷ 100 = 1,7e306 g de HC (finito: el
    // producto 1,7e308 todavía entra en un number); la suma de 200, no.
    const items = Array.from({ length: 200 }, () => asEaten(100, 1.7e306))
    const result = expectFailure(calculateMeal(items, settings))
    expect(result.errors).toEqual(['INVALID_QUANTITY'])
    expect(result.items.every((item) => item.ok)).toBe(true)
    expect(result).not.toHaveProperty('totalCarbsG')
    expect(result).not.toHaveProperty('doseUnits')
  })

  it('una dosis que desborda (ratio chico) da INVALID_QUANTITY de la comida', () => {
    // 1e306 g de HC ÷ 0,001 = 1e309: infinito.
    const result = expectFailure(
      calculateMeal([asEaten(100, 1e306)], {
        ...settings,
        carbRatioGPerUnit: 0.001,
      }),
    )
    expect(result.errors).toEqual(['INVALID_QUANTITY'])
    expect(result.items[0]?.ok).toBe(true)
    expect(result).not.toHaveProperty('doseUnits')
  })

  it('un ratio muy chico con HC normales también desborda', () => {
    const result = expectFailure(
      calculateMeal([asEaten(50, 100)], {
        ...settings,
        carbRatioGPerUnit: Number.MIN_VALUE,
      }),
    )
    expect(result.errors).toEqual(['INVALID_QUANTITY'])
  })

  it('el umbral de dosis no tapa el desborde', () => {
    const result = calculateMeal([asEaten(100, 1e306)], {
      ...settings,
      carbRatioGPerUnit: 0.001,
      maxDoseWarningUnits: 10,
    })
    expect(result.ok).toBe(false)
  })

  it('un resultado ok siempre tiene todos sus números finitos', () => {
    const quantities = [0.1, 1, 250, 1e100, 1e200, 1e306, 1.7e306, 1e307, huge]
    const unitWeights = [0.5, 50, 1e10, 1e300]
    const ratios = [Number.MIN_VALUE, 1e-300, 0.001, 1, 15, 1e300]
    const carbs = [0, 1, 50, 100]
    for (const ratio of ratios) {
      for (const carbsPer100g of carbs) {
        for (const quantity of quantities) {
          const cases: MealItemInput[][] = [
            [asEaten(carbsPer100g, quantity)],
            [rawCooked(carbsPer100g, 1, quantity)],
            Array.from({ length: 200 }, () => asEaten(carbsPer100g, quantity)),
            ...unitWeights.map((weight) => [
              byUnits(carbsPer100g, weight, quantity),
            ]),
          ]
          for (const items of cases) {
            const result = calculateMeal(items, {
              ...settings,
              carbRatioGPerUnit: ratio,
            })
            if (result.ok) expectAllFinite(result)
          }
        }
      }
    }
  })
})

describe('desborde: bordes', () => {
  // The next double above / below a finite positive number.
  const bits = new Float64Array(1)
  const raw = new BigInt64Array(bits.buffer)
  function nextUp(value: number): number {
    bits[0] = value
    raw[0] = (raw[0] ?? 0n) + 1n
    return bits[0] ?? NaN
  }
  function nextDown(value: number): number {
    bits[0] = value
    raw[0] = (raw[0] ?? 0n) - 1n
    return bits[0] ?? NaN
  }

  it('gramos × HC 100: el mayor que no desborda se calcula, el siguiente no', () => {
    // 1,7976931348623156e306 × 100 todavía es finito; el double siguiente, no.
    const largest = 1.7976931348623156e306
    const item = onlyItem(
      calculateMeal([asEaten(100, largest)], {
        ...settings,
        carbRatioGPerUnit: 1,
      }),
    )
    expect(Number.isFinite(item.carbsG)).toBe(true)
    expect(
      itemErrors(calculateMeal([asEaten(100, nextUp(largest))], settings)),
    ).toEqual(['INVALID_QUANTITY'])
  })

  it('unidades × peso: el mayor que no desborda se calcula, el siguiente no', () => {
    // HC 0, para que solo cuente el producto unidades × peso.
    const largest = 3.595386269724631e306
    const item = onlyItem(calculateMeal([byUnits(0, 50, largest)], settings))
    expect(item.grams).toBe(largest * 50)
    expect(Number.isFinite(item.grams)).toBe(true)
    expect(item.carbsG).toBe(0)
    expect(
      itemErrors(calculateMeal([byUnits(0, 50, nextUp(largest))], settings)),
    ).toEqual(['INVALID_QUANTITY'])
  })

  it('la suma: 179 ítems de 1e306 g de HC se calculan, 180 no', () => {
    const big = asEaten(100, 1e306)
    const ratio = { ...settings, carbRatioGPerUnit: 1e300 }
    const fits = expectSuccess(
      calculateMeal(
        Array.from({ length: 179 }, () => big),
        ratio,
      ),
    )
    expect(Number.isFinite(fits.totalCarbsG)).toBe(true)
    const overflow = expectFailure(
      calculateMeal(
        Array.from({ length: 180 }, () => big),
        ratio,
      ),
    )
    expect(overflow.errors).toEqual(['INVALID_QUANTITY'])
    expect(overflow.items).toHaveLength(180)
    expect(overflow.items.every((item) => item.ok)).toBe(true)
  })

  it('la dosis: el menor ratio que no desborda se calcula, el anterior no', () => {
    // 1e306 g de HC ÷ 0,005562684646268004 todavía es finito.
    const smallest = 0.005562684646268004
    const fits = expectSuccess(
      calculateMeal([asEaten(100, 1e306)], {
        ...settings,
        carbRatioGPerUnit: smallest,
      }),
    )
    expect(Number.isFinite(fits.doseUnits)).toBe(true)
    const overflow = expectFailure(
      calculateMeal([asEaten(100, 1e306)], {
        ...settings,
        carbRatioGPerUnit: nextDown(smallest),
      }),
    )
    expect(overflow.errors).toEqual(['INVALID_QUANTITY'])
    expect(overflow.items[0]?.ok).toBe(true)
  })

  it('-0 como cantidad da INVALID_QUANTITY, no desborde', () => {
    expect(itemErrors(calculateMeal([asEaten(50, -0)], settings))).toEqual([
      'INVALID_QUANTITY',
    ])
    expect(itemErrors(calculateMeal([byUnits(58, 50, -0)], settings))).toEqual([
      'INVALID_QUANTITY',
    ])
  })

  it('-0 como HC con una cantidad enorme se calcula: 0 g de HC, finito', () => {
    const result = expectSuccess(calculateMeal([asEaten(-0, 1e308)], settings))
    expect(result.totalCarbsG).toBe(0)
    expect(result.doseUnits).toBe(0)
    expect(Number.isFinite(result.items[0]?.carbsG ?? NaN)).toBe(true)
  })

  it('-0 como ratio da INVALID_RATIO, no INVALID_QUANTITY', () => {
    const result = expectFailure(
      calculateMeal([asEaten(50, 100)], { ...settings, carbRatioGPerUnit: -0 }),
    )
    expect(result.errors).toEqual(['INVALID_RATIO'])
  })

  it('-0 como peso por unidad da MISSING_UNIT_WEIGHT', () => {
    expect(
      itemErrors(calculateMeal([byUnits(58, -0, 1e308)], settings)),
    ).toEqual(['MISSING_UNIT_WEIGHT'])
  })

  it('con desborde en el total, cada ítem sigue ok con sus números finitos', () => {
    const items = Array.from({ length: 200 }, () => asEaten(100, 1.7e306))
    const result = expectFailure(calculateMeal(items, settings))
    expect(result.errors).toEqual(['INVALID_QUANTITY'])
    for (const item of result.items) {
      expect(item.ok).toBe(true)
      if (!item.ok) continue
      expect(Number.isFinite(item.grams)).toBe(true)
      expect(Number.isFinite(item.carbsG)).toBe(true)
    }
  })

  it('el umbral de gramos del ítem no tapa el desborde del ítem', () => {
    // 1e308 g supera el umbral, pero el ítem da error y no advertencias.
    const result = expectFailure(
      calculateMeal([asEaten(50, 1e308)], {
        ...settings,
        maxItemGramsWarning: 1,
      }),
    )
    expect(result.items[0]).toEqual({ ok: false, errors: ['INVALID_QUANTITY'] })
  })

  it('el umbral de gramos no tapa el desborde del total', () => {
    const items = Array.from({ length: 200 }, () => asEaten(100, 1.7e306))
    const result = expectFailure(
      calculateMeal(items, { ...settings, maxItemGramsWarning: 1 }),
    )
    expect(result.errors).toEqual(['INVALID_QUANTITY'])
    // Los ítems conservan su advertencia: son válidos.
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        ok: true,
        warnings: ['ITEM_GRAMS_ABOVE_THRESHOLD'],
      }),
    )
  })

  it('un umbral de dosis 0 no tapa el desborde de la dosis', () => {
    const result = calculateMeal([asEaten(100, 1e306)], {
      ...settings,
      carbRatioGPerUnit: 0.001,
      maxDoseWarningUnits: 0,
    })
    expect(result).toEqual(
      expect.objectContaining({ ok: false, errors: ['INVALID_QUANTITY'] }),
    )
    expect(result).not.toHaveProperty('warnings')
  })

  it('un ítem inválido junto a ítems que sumados desbordan: solo el error del ítem', () => {
    // Con un ítem inválido no se calcula el total, así que no hay
    // INVALID_QUANTITY de la comida.
    const items = [
      ...Array.from({ length: 200 }, () => asEaten(100, 1.7e306)),
      asEaten(50, null),
    ]
    const result = expectFailure(calculateMeal(items, settings))
    expect(result.errors).toEqual([])
    expect(result.items[200]).toEqual({
      ok: false,
      errors: ['INVALID_QUANTITY'],
    })
    expect(result.items.slice(0, 200).every((item) => item.ok)).toBe(true)
  })

  it('un ítem que desborda junto a uno con error del alimento', () => {
    const result = expectFailure(
      calculateMeal([asEaten(50, 1e308), rawCooked(78, null, 250)], settings),
    )
    expect(result.errors).toEqual([])
    expect(result.items).toEqual([
      { ok: false, errors: ['INVALID_QUANTITY'] },
      { ok: false, errors: ['MISSING_COOKING_FACTOR'] },
    ])
  })

  it('un ratio inválido con ítems que sumados desbordan: solo INVALID_RATIO', () => {
    const items = Array.from({ length: 200 }, () => asEaten(100, 1.7e306))
    const result = expectFailure(
      calculateMeal(items, { ...settings, carbRatioGPerUnit: 0 }),
    )
    expect(result.errors).toEqual(['INVALID_RATIO'])
  })

  it('el desborde de un ítem es solo INVALID_QUANTITY, sin otros códigos', () => {
    const result = expectFailure(
      calculateMeal([rawCooked(78, 2.6, 1e308)], {
        ...settings,
        maxItemGramsWarning: 1,
      }),
    )
    expect(result.items[0]).toEqual({ ok: false, errors: ['INVALID_QUANTITY'] })
  })
})

describe('CALC_VERSION', () => {
  // Detector de cambios: si cambia el comportamiento del cálculo, se sube la
  // versión y se actualiza este test (CLAUDE.md, spec §14 #45).
  it('es "2" desde el chequeo de desborde', () => {
    expect(CALC_VERSION).toBe('2')
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
