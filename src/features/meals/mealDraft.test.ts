import { describe, expect, it } from 'vitest'
import {
  calculateMeal,
  type DoseSettings,
  type ItemResult,
} from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'
import type { Settings } from '../../lib/settings.ts'
import {
  canUseUnits,
  foodErrors,
  newItemDraft,
  quantityError,
  toDoseSettings,
  toMealItemInput,
} from './mealDraft.ts'
import type { MealItemDraft } from './types.ts'

// Invented data, not real foods (the values of spec §8.3).

const base: Food = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Banana de prueba',
  brand: null,
  source: 'manual',
  state: 'as_eaten',
  carbs_per_100g: 20.2,
  cooking_factor: null,
  unit_weight_g: null,
  unit_label: null,
  reference_db: null,
  reference_code: null,
  reference_description: null,
  notes: 'Inventado',
  archived_at: null,
}

const rice: Food = {
  ...base,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Arroz de prueba',
  state: 'raw_cooked',
  carbs_per_100g: 78,
  cooking_factor: 2.6,
}

const alfajor: Food = {
  ...base,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Alfajor de prueba',
  brand: 'Marca Inventada',
  carbs_per_100g: 58,
  unit_weight_g: 50,
  unit_label: 'alfajor',
}

const settings: DoseSettings = {
  carbRatioGPerUnit: 15,
  maxDoseWarningUnits: 10,
  maxItemGramsWarning: 500,
}

function draft(
  food: Food,
  quantityText: string,
  quantityMode: MealItemDraft['quantityMode'] = 'grams',
  key = 0,
): MealItemDraft {
  return { key, food, quantityMode, quantityText }
}

/** The field error on blur, as MealForm computes it: with the item result. */
function fieldError(
  text: string,
  food: Food = base,
  mode: MealItemDraft['quantityMode'] = 'grams',
) {
  const item = draft(food, text, mode)
  const result = calculateMeal([toMealItemInput(item)], settings).items[0]
  return quantityError(text, result)
}

// "1" followed by 308 zeros: a finite number that overflows once multiplied
// (by the unit weight or by the carbs).
const HUGE_TEXT = '1' + '0'.repeat(308)

describe('canUseUnits', () => {
  it('as_eaten with a unit weight → true', () => {
    expect(canUseUnits(alfajor)).toBe(true)
  })

  it('as_eaten without a unit weight → false', () => {
    expect(canUseUnits(base)).toBe(false)
  })

  it('raw_cooked with a unit weight (should not exist) → false', () => {
    expect(canUseUnits({ ...rice, unit_weight_g: 80 })).toBe(false)
  })

  it('raw_cooked without a unit weight → false', () => {
    expect(canUseUnits(rice)).toBe(false)
  })

  it('when it is true, calculateMeal accepts 1 unit', () => {
    for (const food of [alfajor, base, rice, { ...rice, unit_weight_g: 80 }]) {
      if (!canUseUnits(food)) continue
      const result = calculateMeal(
        [toMealItemInput(draft(food, '1', 'units'))],
        settings,
      )
      expect(result.ok).toBe(true)
    }
  })

  it('when it is false, calculateMeal rejects units', () => {
    for (const food of [base, rice, { ...rice, unit_weight_g: 80 }]) {
      expect(canUseUnits(food)).toBe(false)
      const result = calculateMeal(
        [toMealItemInput(draft(food, '1', 'units'))],
        settings,
      )
      expect(result.ok).toBe(false)
    }
  })
})

describe('newItemDraft', () => {
  it('starts in units when the food allows it', () => {
    expect(newItemDraft(7, alfajor)).toEqual({
      key: 7,
      food: alfajor,
      quantityMode: 'units',
      quantityText: '',
    })
  })

  it('starts in grams otherwise', () => {
    expect(newItemDraft(1, base).quantityMode).toBe('grams')
    expect(newItemDraft(2, rice).quantityMode).toBe('grams')
    expect(newItemDraft(3, { ...rice, unit_weight_g: 80 }).quantityMode).toBe(
      'grams',
    )
  })

  it('starts with the quantity empty', () => {
    expect(newItemDraft(0, base).quantityText).toBe('')
  })

  it('keeps the food row it receives (a copy taken when picked)', () => {
    expect(newItemDraft(0, rice).food).toBe(rice)
  })
})

describe('toMealItemInput', () => {
  it.each([
    ['250', 250],
    ['0,5', 0.5],
    ['1.500', 1500],
    [' 120 ', 120],
    ['0,1', 0.1],
  ])('reads %j as %s', (text, quantity) => {
    expect(toMealItemInput(draft(base, text)).quantity).toBe(quantity)
  })

  it.each(['', '   ', '12,', ',5', '12.5', '1.50', '-5', 'abc'])(
    'reads %j as null (not a number, spec §8.7)',
    (text) => {
      expect(toMealItemInput(draft(base, text)).quantity).toBeNull()
    },
  )

  it('reads "0" as 0: the calculation reports it (INVALID_QUANTITY)', () => {
    const input = toMealItemInput(draft(base, '0'))
    expect(input.quantity).toBe(0)
    const result = calculateMeal([input], settings)
    expect(result.items[0]).toEqual({ ok: false, errors: ['INVALID_QUANTITY'] })
  })

  it('copies the food values without changing them', () => {
    expect(toMealItemInput(draft(rice, '250'))).toEqual({
      foodState: 'raw_cooked',
      carbsPer100g: 78,
      cookingFactor: 2.6,
      unitWeightG: null,
      quantityMode: 'grams',
      quantity: 250,
    })
    expect(toMealItemInput(draft(alfajor, '0,5', 'units'))).toEqual({
      foodState: 'as_eaten',
      carbsPer100g: 58,
      cookingFactor: null,
      unitWeightG: 50,
      quantityMode: 'units',
      quantity: 0.5,
    })
  })

  it('does not round', () => {
    const food = { ...base, carbs_per_100g: 0.1 + 0.2 }
    expect(toMealItemInput(draft(food, '0,30000000000000004'))).toEqual(
      expect.objectContaining({
        carbsPer100g: 0.1 + 0.2,
        quantity: 0.30000000000000004,
      }),
    )
  })

  it('does not modify the item', () => {
    const item = draft(rice, '250')
    const before = structuredClone(item)
    toMealItemInput(item)
    expect(item).toEqual(before)
  })

  it('an archived food is still calculated (the item keeps its copy)', () => {
    const archived = { ...base, archived_at: '2026-11-14T12:00:00+00:00' }
    const result = calculateMeal(
      [toMealItemInput(draft(archived, '120'))],
      settings,
    )
    expect(result.ok).toBe(true)
  })
})

describe('toDoseSettings', () => {
  const row: Settings = {
    user_id: '00000000-0000-4000-8000-000000000009',
    carb_ratio_g_per_unit: 12.5,
    max_dose_warning_units: 10,
    max_item_grams_warning: 500,
  }

  it('maps the three values', () => {
    expect(toDoseSettings(row)).toEqual({
      carbRatioGPerUnit: 12.5,
      maxDoseWarningUnits: 10,
      maxItemGramsWarning: 500,
    })
  })

  it('keeps a dose threshold that is not configured (null)', () => {
    expect(
      toDoseSettings({ ...row, max_dose_warning_units: null })
        .maxDoseWarningUnits,
    ).toBeNull()
  })
})

describe('quantityError', () => {
  it.each([
    ['', 'REQUIRED'],
    ['   ', 'REQUIRED'],
    ['12,', 'INVALID_NUMBER'],
    [',5', 'INVALID_NUMBER'],
    ['12.5', 'INVALID_NUMBER'],
    ['0', 'NOT_POSITIVE'],
    ['0,0', 'NOT_POSITIVE'],
  ])('%j → %s', (text, error) => {
    expect(fieldError(text)).toBe(error)
  })

  it.each(['0,1', '250', '1.500', '0,5'])('%j → null', (text) => {
    expect(fieldError(text)).toBeNull()
  })
})

describe('foodErrors', () => {
  it('a valid item has none', () => {
    const result: ItemResult = {
      ok: true,
      grams: 120,
      effectiveCarbsPer100g: 20.2,
      carbsG: 24.24,
      warnings: [],
    }
    expect(foodErrors(result)).toEqual([])
  })

  it('leaves out INVALID_QUANTITY (shown by the field, on blur)', () => {
    expect(foodErrors({ ok: false, errors: ['INVALID_QUANTITY'] })).toEqual([])
  })

  it('keeps the errors that come from the food, in order', () => {
    expect(
      foodErrors({
        ok: false,
        errors: ['INVALID_QUANTITY', 'EFFECTIVE_CARBS_OVER_100'],
      }),
    ).toEqual(['EFFECTIVE_CARBS_OVER_100'])
    expect(
      foodErrors({
        ok: false,
        errors: ['INVALID_CARBS', 'MISSING_COOKING_FACTOR'],
      }),
    ).toEqual(['INVALID_CARBS', 'MISSING_COOKING_FACTOR'])
  })

  it('shows the food error right away, even with the quantity empty', () => {
    const food = { ...rice, cooking_factor: 0.5 }
    const result = calculateMeal([toMealItemInput(draft(food, ''))], settings)
    const item = result.items[0]
    expect(item).toBeDefined()
    if (item !== undefined) {
      expect(foodErrors(item)).toEqual(['EFFECTIVE_CARBS_OVER_100'])
    }
  })
})

describe('the meal of spec §8.3, from the form', () => {
  it('gives the same result as the hand calculation', () => {
    const items = [
      draft(rice, '250', 'grams', 0),
      draft(base, '120', 'grams', 1),
      draft(alfajor, '1', 'units', 2),
    ]
    const result = calculateMeal(items.map(toMealItemInput), settings)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items.map((item) => item.grams)).toEqual([250, 120, 50])
    expect(result.totalCarbsG).toBeCloseTo(128.24, 10)
    expect(result.doseUnits).toBeCloseTo(128.24 / 15, 10)
  })

  it('the same food twice adds up', () => {
    const items = [
      draft(base, '120', 'grams', 0),
      draft(base, '80', 'grams', 1),
    ]
    const result = calculateMeal(items.map(toMealItemInput), settings)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.totalCarbsG).toBeCloseTo((200 * 20.2) / 100, 10)
  })
})

describe('quantityError and the calculation agree', () => {
  // The field shows an error on blur exactly when calculateMeal reports
  // INVALID_QUANTITY for the same text: otherwise the total could stay
  // hidden with no error on the field, or the reverse.
  const texts = [
    '',
    '   ',
    ' ',
    '0',
    '0,0',
    '000',
    '0,0001',
    '0,1',
    '1',
    '1,0',
    '250',
    '1.500',
    '1.500,25',
    '12,',
    ',5',
    ',',
    '12.5',
    '1.50',
    '-5',
    '+5',
    '1e3',
    'Infinity',
    'NaN',
    '9'.repeat(400),
    HUGE_TEXT,
  ]

  it.each(texts)('%j', (text) => {
    for (const food of [base, rice]) {
      const item = calculateMeal([toMealItemInput(draft(food, text))], settings)
        .items[0]
      const invalid =
        item !== undefined &&
        !item.ok &&
        item.errors.includes('INVALID_QUANTITY')
      expect(quantityError(text, item) !== null).toBe(invalid)
    }
  })

  it('also in units', () => {
    for (const text of ['', '0', '0,5', '1', '12,', HUGE_TEXT]) {
      const item = calculateMeal(
        [toMealItemInput(draft(alfajor, text, 'units'))],
        settings,
      ).items[0]
      const invalid =
        item !== undefined &&
        !item.ok &&
        item.errors.includes('INVALID_QUANTITY')
      expect(quantityError(text, item) !== null).toBe(invalid)
    }
  })
})

describe('quantityError: bordes', () => {
  it.each([
    [' ', 'REQUIRED'],
    ['000', 'NOT_POSITIVE'],
    ['-1', 'INVALID_NUMBER'],
    [',', 'INVALID_NUMBER'],
    ['9'.repeat(400), 'INVALID_NUMBER'],
  ])('%j → %s', (text, error) => {
    expect(fieldError(text)).toBe(error)
  })

  it('a very small quantity is valid', () => {
    expect(fieldError('0,0001')).toBeNull()
  })
})

describe('quantityError: a number so big that the item overflows', () => {
  it('the text is read as 1e308 (a finite number)', () => {
    expect(toMealItemInput(draft(base, HUGE_TEXT)).quantity).toBe(1e308)
  })

  it('in grams, the calculation gives INVALID_QUANTITY and the field INVALID_NUMBER', () => {
    for (const food of [base, rice, alfajor]) {
      const item = calculateMeal(
        [toMealItemInput(draft(food, HUGE_TEXT))],
        settings,
      ).items[0]
      expect(item).toEqual({ ok: false, errors: ['INVALID_QUANTITY'] })
      expect(quantityError(HUGE_TEXT, item)).toBe('INVALID_NUMBER')
    }
  })

  it('in units too (units × unit weight overflows)', () => {
    expect(fieldError(HUGE_TEXT, alfajor, 'units')).toBe('INVALID_NUMBER')
  })

  it('with carbs 0 it does not overflow, and the field has no error', () => {
    const food = { ...base, carbs_per_100g: 0 }
    expect(fieldError(HUGE_TEXT, food)).toBeNull()
  })

  it('a food error alone does not become a field error', () => {
    const food = { ...rice, cooking_factor: null }
    expect(fieldError('250', food)).toBeNull()
  })

  it('without the item result, only the text is checked', () => {
    expect(quantityError(HUGE_TEXT, undefined)).toBeNull()
    expect(quantityError('', undefined)).toBe('REQUIRED')
  })

  it('a parse error wins over the result', () => {
    expect(
      quantityError('12,', { ok: false, errors: ['INVALID_QUANTITY'] }),
    ).toBe('INVALID_NUMBER')
    expect(
      quantityError('0', { ok: false, errors: ['INVALID_QUANTITY'] }),
    ).toBe('NOT_POSITIVE')
  })
})

describe('quantityError: desborde, bordes', () => {
  it('"-0" is not a number for the field', () => {
    expect(fieldError('-0')).toBe('INVALID_NUMBER')
  })

  it('a meal-level overflow (tiny ratio) does not become a field error', () => {
    const result = calculateMeal([toMealItemInput(draft(base, '1.000'))], {
      ...settings,
      carbRatioGPerUnit: Number.MIN_VALUE,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(['INVALID_QUANTITY'])
    expect(quantityError('1.000', result.items[0])).toBeNull()
  })

  it('a valid item above the grams threshold has no field error', () => {
    const item = calculateMeal([toMealItemInput(draft(base, '10.000'))], {
      ...settings,
      maxItemGramsWarning: 1,
    }).items[0]
    expect(item?.ok).toBe(true)
    expect(quantityError('10.000', item)).toBeNull()
  })

  it('an ok item result never turns a valid text into an error', () => {
    const ok: ItemResult = {
      ok: true,
      grams: 1,
      effectiveCarbsPer100g: 1,
      carbsG: 0.01,
      warnings: ['ITEM_GRAMS_ABOVE_THRESHOLD'],
    }
    expect(quantityError('1', ok)).toBeNull()
  })

  it('a failed item without INVALID_QUANTITY does not mark the field', () => {
    expect(
      quantityError('250', { ok: false, errors: ['INVALID_CARBS'] }),
    ).toBeNull()
  })
})

describe('toMealItemInput: bordes', () => {
  it('a quantity with many decimals is kept exact', () => {
    expect(toMealItemInput(draft(base, '0,0001')).quantity).toBe(0.0001)
    expect(toMealItemInput(draft(base, '1.234.567,25')).quantity).toBe(
      1234567.25,
    )
  })

  it('"1,0" is read as 1 (the breakdown shows "1 unidad")', () => {
    expect(toMealItemInput(draft(alfajor, '1,0', 'units')).quantity).toBe(1)
  })

  it('in grams mode it still passes the unit weight (the calculation ignores it)', () => {
    const input = toMealItemInput(draft(alfajor, '50', 'grams'))
    expect(input.unitWeightG).toBe(50)
    const result = calculateMeal([input], settings)
    expect(result.ok && result.items[0]?.grams).toBe(50)
  })

  it('1 unit and its weight in grams give the same carbs', () => {
    const units = calculateMeal(
      [toMealItemInput(draft(alfajor, '1', 'units'))],
      settings,
    )
    const grams = calculateMeal(
      [toMealItemInput(draft(alfajor, '50', 'grams'))],
      settings,
    )
    expect(units.ok && grams.ok).toBe(true)
    if (!units.ok || !grams.ok) return
    expect(units.totalCarbsG).toBe(grams.totalCarbsG)
  })

  it('a food missing the factor gives MISSING_COOKING_FACTOR', () => {
    const food = { ...rice, cooking_factor: null }
    const item = calculateMeal([toMealItemInput(draft(food, '250'))], settings)
      .items[0]
    expect(item).toEqual({ ok: false, errors: ['MISSING_COOKING_FACTOR'] })
  })
})

describe('newItemDraft: bordes', () => {
  it('does not modify the food', () => {
    const food = structuredClone(alfajor)
    newItemDraft(0, food)
    expect(food).toEqual(alfajor)
  })

  it('a food with unit weight but no unit label also starts in units', () => {
    expect(newItemDraft(0, { ...alfajor, unit_label: null }).quantityMode).toBe(
      'units',
    )
  })
})

describe('foodErrors: bordes', () => {
  it('removes INVALID_QUANTITY wherever it is and keeps the rest in order', () => {
    expect(
      foodErrors({
        ok: false,
        errors: [
          'INVALID_CARBS',
          'INVALID_QUANTITY',
          'INVALID_COOKING_FACTOR',
          'MISSING_UNIT_WEIGHT',
        ],
      }),
    ).toEqual([
      'INVALID_CARBS',
      'INVALID_COOKING_FACTOR',
      'MISSING_UNIT_WEIGHT',
    ])
  })

  it('keeps every food error', () => {
    const all = [
      'INVALID_CARBS',
      'MISSING_COOKING_FACTOR',
      'INVALID_COOKING_FACTOR',
      'MISSING_UNIT_WEIGHT',
      'UNITS_NOT_ALLOWED_FOR_RAW_COOKED',
      'EFFECTIVE_CARBS_OVER_100',
    ] as const
    for (const code of all) {
      expect(foodErrors({ ok: false, errors: [code] })).toEqual([code])
    }
  })

  it('a raw_cooked food in units gives UNITS_NOT_ALLOWED_FOR_RAW_COOKED', () => {
    const item = calculateMeal(
      [toMealItemInput(draft(rice, '1', 'units'))],
      settings,
    ).items[0]
    expect(item !== undefined && foodErrors(item)).toEqual([
      'UNITS_NOT_ALLOWED_FOR_RAW_COOKED',
    ])
  })

  it('does not modify the result', () => {
    const result: ItemResult = {
      ok: false,
      errors: ['INVALID_QUANTITY', 'INVALID_CARBS'],
    }
    foodErrors(result)
    expect(result.errors).toEqual(['INVALID_QUANTITY', 'INVALID_CARBS'])
  })
})

describe('a meal with one item still empty', () => {
  // MealForm reads result.items[index] for each item: the results have to
  // stay aligned with the items even when the meal is not valid.
  it('keeps the results aligned with the items and shows no dose', () => {
    const items = [
      draft(rice, '250', 'grams', 0),
      draft(base, '', 'grams', 1),
      draft(alfajor, '1', 'units', 2),
    ]
    const result = calculateMeal(items.map(toMealItemInput), settings)
    expect(result.ok).toBe(false)
    expect(result.items).toHaveLength(3)
    expect(result.items[0]?.ok && result.items[0].grams).toBe(250)
    expect(result.items[1]).toEqual({ ok: false, errors: ['INVALID_QUANTITY'] })
    expect(result.items[2]?.ok && result.items[2].grams).toBe(50)
    expect(
      result.items[1] !== undefined && foodErrors(result.items[1]),
    ).toEqual([])
  })

  it('an invalid ratio is reported even with valid items', () => {
    const result = calculateMeal(
      [toMealItemInput(draft(base, '120'))],
      toDoseSettings({
        user_id: '00000000-0000-4000-8000-000000000009',
        carb_ratio_g_per_unit: 0,
        max_dose_warning_units: null,
        max_item_grams_warning: 500,
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(['INVALID_RATIO'])
    expect(result.items[0]?.ok).toBe(true)
  })
})
