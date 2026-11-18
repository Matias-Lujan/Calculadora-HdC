import { describe, expect, it } from 'vitest'
import {
  appliedDoseShortcuts,
  CALC_VERSION,
  calculateMeal,
  formatUserNumber,
  type DoseSettings,
  type ItemResult,
  type MealSuccess,
} from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'
import type { Settings } from '../../lib/settings.ts'
import {
  appliedDose,
  eatenAtToSave,
  appliedDoseFieldText,
  canUseUnits,
  doseWarning,
  firstMealProblem,
  foodErrors,
  isAppliedDoseShortcut,
  itemWarnings,
  newItemDraft,
  quantityError,
  removeItem,
  restoreItem,
  saveWarnings,
  toDoseSettings,
  toMealItemInput,
  toNewMealRecord,
} from './mealDraft.ts'
import { tableFoodAsMealFood } from './tableFoods.ts'
import type { MealItemDraft, NewMealItem, NewMealRecord } from './types.ts'

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
  photo_path: null,
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
    usage_notice_accepted_at: null,
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
        usage_notice_accepted_at: null,
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(['INVALID_RATIO'])
    expect(result.items[0]?.ok).toBe(true)
  })
})

// --- Saving (stage 5, functionality 2) ---

const row: Settings = {
  user_id: '00000000-0000-4000-8000-000000000009',
  carb_ratio_g_per_unit: 15,
  max_dose_warning_units: 10,
  max_item_grams_warning: 500,
  usage_notice_accepted_at: null,
}

/** The same settings without the dose threshold, to look only at items. */
const noDoseThreshold: Settings = { ...row, max_dose_warning_units: null }

/** The §8.3 meal: rice, banana and one alfajor. */
function mealOf83(): MealItemDraft[] {
  return [
    draft(rice, '250', 'grams', 0),
    draft(base, '120', 'grams', 1),
    draft(alfajor, '1', 'units', 2),
  ]
}

/** calculateMeal on the drafts, as MealForm does; fails if not ok. */
function calcOk(items: MealItemDraft[], s: Settings = row): MealSuccess {
  const result = calculateMeal(items.map(toMealItemInput), toDoseSettings(s))
  if (!result.ok) throw new Error('expected a valid meal')
  return result
}

const EATEN_AT = '2026-11-14T16:05:00.000Z'

describe('appliedDose', () => {
  it('null follows the calculated dose, exactly', () => {
    expect(appliedDose(null, 128.24 / 15)).toEqual({ value: 128.24 / 15 })
    expect(appliedDose(null, 8.546666666666667)).toEqual({
      value: 8.546666666666667,
    })
  })

  it('a typed text is read as typed, without rounding', () => {
    expect(appliedDose('8', 8.546666666666667)).toEqual({ value: 8 })
    expect(appliedDose('8,5', 8.546666666666667)).toEqual({ value: 8.5 })
    expect(appliedDose('8,546666666666667', 1)).toEqual({
      value: 8.546666666666667,
    })
  })

  it('0 is valid', () => {
    expect(appliedDose('0', 8.5)).toEqual({ value: 0 })
    expect(appliedDose('0,0', 8.5)).toEqual({ value: 0 })
  })

  it.each([
    ['', 'REQUIRED'],
    ['   ', 'REQUIRED'],
    ['8,', 'INVALID_NUMBER'],
    [',5', 'INVALID_NUMBER'],
    ['8.5', 'INVALID_NUMBER'],
    ['-1', 'INVALID_NUMBER'],
  ])('%j → %s', (text, error) => {
    expect(appliedDose(text, 8.5)).toEqual({ error })
  })

  it('a calculated dose of 0 is followed as 0', () => {
    expect(appliedDose(null, 0)).toEqual({ value: 0 })
  })
})

describe('appliedDoseFieldText', () => {
  it('following the calculated dose, shows it formatted', () => {
    expect(appliedDoseFieldText(null, calcOk(mealOf83()))).toBe('8,55')
  })

  it('following an invalid result, shows nothing', () => {
    const result = calculateMeal(
      [toMealItemInput(draft(base, ''))],
      toDoseSettings(row),
    )
    expect(result.ok).toBe(false)
    expect(appliedDoseFieldText(null, result)).toBe('')
  })

  it('an edited text is shown as typed, valid or not', () => {
    const result = calcOk(mealOf83())
    expect(appliedDoseFieldText('8', result)).toBe('8')
    expect(appliedDoseFieldText('8,', result)).toBe('8,')
    expect(appliedDoseFieldText('', result)).toBe('')
  })

  it('an edited text is kept even if the result is invalid', () => {
    const result = calculateMeal([], toDoseSettings(row))
    expect(appliedDoseFieldText('7,5', result)).toBe('7,5')
  })

  it('a dose of 0 is shown as "0", without trailing zeros', () => {
    const food = { ...base, carbs_per_100g: 0 }
    expect(appliedDoseFieldText(null, calcOk([draft(food, '120')]))).toBe('0')
  })

  it('a whole dose is shown as "7", not "7,00"', () => {
    // 105 g of carbs ÷ 15 = 7.
    const food = { ...base, carbs_per_100g: 100 }
    expect(appliedDoseFieldText(null, calcOk([draft(food, '105')]))).toBe('7')
  })
})

describe('isAppliedDoseShortcut', () => {
  it('never while the field follows the calculated dose', () => {
    expect(isAppliedDoseShortcut(null, 8)).toBe(false)
    expect(isAppliedDoseShortcut(null, 0)).toBe(false)
  })

  it.each([
    ['8', 8, true],
    ['8,0', 8, true],
    ['8,5', 8.5, true],
    ['0', 0, true],
    ['1.000', 1000, true],
    ['8,5', 8, false],
    ['8,', 8, false],
    ['', 0, false],
  ])('%j with the shortcut %s → %s', (text, units, chosen) => {
    expect(isAppliedDoseShortcut(text, units)).toBe(chosen)
  })

  // MealForm: a tap on a shortcut sets the field to formatUserNumber(units).
  it.each([0, 0.004, 0.5, 8, 8.5, 8.994, 8.995, 8.999, 999.6, 1234.5])(
    'a tapped shortcut of the dose %s saves exactly its value, and only it is chosen',
    (dose) => {
      const { penUnits } = appliedDoseShortcuts(dose)
      expect(penUnits.length).toBeGreaterThan(0)
      for (const units of penUnits) {
        const text = formatUserNumber(units)
        expect(appliedDose(text, dose)).toEqual({ value: units })
        const chosen = penUnits.filter((other) =>
          isAppliedDoseShortcut(text, other),
        )
        expect(chosen).toEqual([units])
      }
    },
  )
})

describe('firstMealProblem', () => {
  const at = '2026-11-14T13:05'

  it('a meal that can be saved has none', () => {
    const items = mealOf83()
    expect(firstMealProblem(items, calcOk(items), null, null)).toBeNull()
    expect(firstMealProblem(items, calcOk(items), '8,5', at)).toBeNull()
    expect(firstMealProblem(items, calcOk(items), '0', null)).toBeNull()
  })

  it('an empty quantity: what is missing, with the name and the item', () => {
    const items = [draft(base, '120', 'grams', 0), draft(rice, '', 'grams', 4)]
    const result = calculateMeal(items.map(toMealItemInput), settings)
    expect(firstMealProblem(items, result, null, null)).toEqual({
      problem: {
        code: 'QUANTITY',
        foodName: 'Arroz de prueba',
        error: 'REQUIRED',
      },
      itemKey: 4,
    })
  })

  it('the first item with a problem, in the order of the screen', () => {
    const items = [draft(base, '12,', 'grams', 3), draft(rice, '', 'grams', 1)]
    const result = calculateMeal(items.map(toMealItemInput), settings)
    expect(firstMealProblem(items, result, '', '')).toEqual({
      problem: {
        code: 'QUANTITY',
        foodName: 'Banana de prueba',
        error: 'INVALID_NUMBER',
      },
      itemKey: 3,
    })
  })

  it('a quantity of 0 is NOT_POSITIVE', () => {
    const items = [draft(base, '0')]
    const result = calculateMeal(items.map(toMealItemInput), settings)
    expect(firstMealProblem(items, result, null, null)?.problem).toEqual({
      code: 'QUANTITY',
      foodName: 'Banana de prueba',
      error: 'NOT_POSITIVE',
    })
  })

  it('an error of the food comes before its quantity', () => {
    const noFactor = { ...rice, cooking_factor: null }
    const items = [draft(noFactor, '', 'grams', 2)]
    const result = calculateMeal(items.map(toMealItemInput), settings)
    expect(firstMealProblem(items, result, null, null)).toEqual({
      problem: { code: 'FOOD', foodName: 'Arroz de prueba' },
      itemKey: 2,
    })
  })

  it('then the applied dose: empty or not a number', () => {
    const items = mealOf83()
    expect(firstMealProblem(items, calcOk(items), '', at)).toEqual({
      problem: { code: 'APPLIED_DOSE', error: 'REQUIRED' },
      itemKey: null,
    })
    expect(firstMealProblem(items, calcOk(items), '8,', at)).toEqual({
      problem: { code: 'APPLIED_DOSE', error: 'INVALID_NUMBER' },
      itemKey: null,
    })
  })

  it('then the date: empty or not a real date', () => {
    const items = mealOf83()
    expect(firstMealProblem(items, calcOk(items), null, '')).toEqual({
      problem: { code: 'EATEN_AT', empty: true },
      itemKey: null,
    })
    expect(
      firstMealProblem(items, calcOk(items), null, '2026-02-30T10:00'),
    ).toEqual({ problem: { code: 'EATEN_AT', empty: false }, itemKey: null })
  })

  it('a meal whose total or dose overflow, with valid fields: the meal', () => {
    const items = mealOf83()
    const result = calculateMeal(items.map(toMealItemInput), {
      ...settings,
      carbRatioGPerUnit: 0,
    })
    expect(result.ok).toBe(false)
    expect(firstMealProblem(items, result, null, null)).toEqual({
      problem: { code: 'MEAL' },
      itemKey: null,
    })
  })

  it('a huge quantity whose item overflows is a quantity to check', () => {
    const items = [draft(base, HUGE_TEXT)]
    const result = calculateMeal(items.map(toMealItemInput), settings)
    expect(firstMealProblem(items, result, null, null)?.problem).toEqual({
      code: 'QUANTITY',
      foodName: 'Banana de prueba',
      error: 'INVALID_NUMBER',
    })
  })
})

describe('removeItem and restoreItem (undo)', () => {
  const a = draft(base, '120', 'grams', 0)
  const b = draft(alfajor, '0,5', 'units', 1)
  const c = draft(rice, '250', 'grams', 2)

  it('removes the item and keeps it with its place', () => {
    expect(removeItem([a, b, c], 1)).toEqual({
      items: [a, c],
      removed: { item: b, index: 1 },
    })
  })

  it('an unknown key removes nothing', () => {
    expect(removeItem([a, b], 9)).toEqual({ items: [a, b], removed: null })
  })

  it('undo puts it back in its place, as it was', () => {
    const { items, removed } = removeItem([a, b, c], 1)
    if (removed === null) throw new Error('missing')
    expect(restoreItem(items, removed)).toEqual([a, b, c])
  })

  it('undo of the last item of the meal', () => {
    const { items, removed } = removeItem([a], 0)
    expect(items).toEqual([])
    if (removed === null) throw new Error('missing')
    expect(restoreItem(items, removed)).toEqual([a])
  })

  it('with fewer items in the meantime, it goes at the end at most', () => {
    expect(restoreItem([a], { item: c, index: 2 })).toEqual([a, c])
    expect(restoreItem([], { item: c, index: 2 })).toEqual([c])
  })

  it('with an item added in the meantime, it keeps its index', () => {
    const d = draft(base, '50', 'grams', 3)
    expect(restoreItem([a, c, d], { item: b, index: 1 })).toEqual([a, b, c, d])
  })

  it('an item already back is not added twice', () => {
    expect(restoreItem([a, b], { item: b, index: 1 })).toEqual([a, b])
  })

  it('does not modify the list it receives', () => {
    const items = [a, b, c]
    removeItem(items, 1)
    restoreItem(items, { item: draft(base, '1', 'grams', 7), index: 0 })
    expect(items).toEqual([a, b, c])
  })
})

describe('saveWarnings', () => {
  it('a meal without warnings gives none', () => {
    expect(saveWarnings(mealOf83(), calcOk(mealOf83()), row)).toEqual([])
  })

  it('11 alfajores of 50 g (550 g, threshold 500) warn', () => {
    const items = [draft(alfajor, '11', 'units')]
    expect(
      saveWarnings(items, calcOk(items, noDoseThreshold), noDoseThreshold),
    ).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Alfajor de prueba',
        grams: '550',
        threshold: '500',
      },
    ])
  })

  it('exactly the grams threshold does not warn', () => {
    const s = noDoseThreshold
    const units = [draft(alfajor, '10', 'units')]
    expect(saveWarnings(units, calcOk(units, s), s)).toEqual([])
    const grams = [draft(base, '500')]
    expect(saveWarnings(grams, calcOk(grams, s), s)).toEqual([])
  })

  it('just above the grams threshold warns, with the grams formatted', () => {
    const items = [draft(base, '500,04')]
    expect(saveWarnings(items, calcOk(items), row)).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Banana de prueba',
        grams: '500',
        threshold: '500',
      },
    ])
  })

  it('a grams threshold with decimals is shown exactly', () => {
    const s = { ...noDoseThreshold, max_item_grams_warning: 1234.5 }
    const items = [draft(base, '1.300')]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Banana de prueba',
        grams: '1300',
        threshold: '1.234,5',
      },
    ])
  })

  it('a rice with factor 4,5 warns: 100 g raw yield 450 g cooked', () => {
    const food = { ...rice, cooking_factor: 4.5 }
    const items = [draft(food, '250')]
    expect(saveWarnings(items, calcOk(items), row)).toEqual([
      {
        code: 'COOKING_FACTOR_UNUSUAL',
        foodName: 'Arroz de prueba',
        cookedGrams: '450',
      },
    ])
  })

  it('a factor whose yield cannot be shown warns without the grams', () => {
    // 50 ÷ 1e307 is a valid item; factor × 100 overflows.
    const food = { ...rice, carbs_per_100g: 50, cooking_factor: 1e307 }
    const items = [draft(food, '250')]
    expect(saveWarnings(items, calcOk(items), row)).toEqual([
      {
        code: 'COOKING_FACTOR_UNUSUAL',
        foodName: 'Arroz de prueba',
        cookedGrams: null,
      },
    ])
  })

  it('the factor of an as_eaten food never warns', () => {
    const food = { ...base, cooking_factor: 9 }
    const items = [draft(food, '120')]
    expect(saveWarnings(items, calcOk(items), row)).toEqual([])
  })

  it('the §8.3 meal with a dose threshold of 8 warns about the dose', () => {
    const s = { ...row, max_dose_warning_units: 8 }
    expect(saveWarnings(mealOf83(), calcOk(mealOf83(), s), s)).toEqual([
      { code: 'DOSE_ABOVE_THRESHOLD', dose: '8,55', threshold: '8' },
    ])
  })

  it('a dose threshold that is not configured never warns', () => {
    const s = noDoseThreshold
    const items = [draft(base, '500'), draft(base, '500', 'grams', 1)]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([])
  })

  it('a dose threshold with decimals is shown exactly', () => {
    const s = { ...row, max_dose_warning_units: 2.5 }
    const items = [draft(base, '200')]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
      { code: 'DOSE_ABOVE_THRESHOLD', dose: '2,69', threshold: '2,5' },
    ])
  })

  it('a dose threshold of 12,5 is shown as "12,5"', () => {
    const s = {
      ...row,
      max_dose_warning_units: 12.5,
      max_item_grams_warning: 5000,
    }
    const items = [draft(base, '1.000')]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
      { code: 'DOSE_ABOVE_THRESHOLD', dose: '13,47', threshold: '12,5' },
    ])
  })

  it('a dose equal to the threshold does not warn', () => {
    const s = { ...row, max_dose_warning_units: 2 }
    const food = { ...base, carbs_per_100g: 15 }
    const items = [draft(food, '200')]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([])
  })

  it('the dose warning is about the calculated dose, not the applied one', () => {
    // saveWarnings does not receive the applied dose: a lower applied dose
    // still warns, a higher one never does.
    const s = { ...row, max_dose_warning_units: 8 }
    expect(saveWarnings(mealOf83(), calcOk(mealOf83(), s), s)).toHaveLength(1)
    const t = { ...row, max_dose_warning_units: 9 }
    expect(saveWarnings(mealOf83(), calcOk(mealOf83(), t), t)).toEqual([])
  })

  it('items first, in order, then the dose', () => {
    const s = { ...row, max_dose_warning_units: 1 }
    const food = { ...rice, cooking_factor: 0.9, carbs_per_100g: 50 }
    const items = [
      draft(base, '120', 'grams', 0),
      draft(food, '600', 'grams', 1),
      draft(alfajor, '12', 'units', 2),
    ]
    const warnings = saveWarnings(items, calcOk(items, s), s)
    expect(warnings.map((w) => w.code)).toEqual([
      'ITEM_GRAMS_ABOVE_THRESHOLD',
      'COOKING_FACTOR_UNUSUAL',
      'ITEM_GRAMS_ABOVE_THRESHOLD',
      'DOSE_ABOVE_THRESHOLD',
    ])
    expect(warnings[0]).toEqual({
      code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
      foodName: 'Arroz de prueba',
      grams: '600',
      threshold: '500',
    })
    expect(warnings[1]).toEqual({
      code: 'COOKING_FACTOR_UNUSUAL',
      foodName: 'Arroz de prueba',
      cookedGrams: '90',
    })
    expect(warnings[2]).toEqual({
      code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
      foodName: 'Alfajor de prueba',
      grams: '600',
      threshold: '500',
    })
  })

  it('the same food twice above the threshold gives two warnings', () => {
    const items = [
      draft(base, '600', 'grams', 0),
      draft(base, '700', 'grams', 1),
    ]
    const s = noDoseThreshold
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Banana de prueba',
        grams: '600',
        threshold: '500',
      },
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Banana de prueba',
        grams: '700',
        threshold: '500',
      },
    ])
  })

  it('gives one warning per warning of calculateMeal', () => {
    const s = { ...row, max_dose_warning_units: 1 }
    const food = { ...rice, cooking_factor: 0.9, carbs_per_100g: 50 }
    const items = [draft(food, '600'), draft(base, '50', 'grams', 1)]
    const result = calcOk(items, s)
    const expected =
      result.items.flatMap((item) => item.warnings).length +
      result.warnings.length
    expect(expected).toBe(3)
    expect(saveWarnings(items, result, s)).toHaveLength(expected)
  })

  it('throws if the result does not match the items', () => {
    const result = calcOk(mealOf83())
    expect(() => saveWarnings(mealOf83().slice(0, 2), result, row)).toThrow()
  })

  it('is the items warnings in order, then the dose one', () => {
    const s = { ...row, max_dose_warning_units: 1 }
    const food = { ...rice, cooking_factor: 0.9, carbs_per_100g: 50 }
    const items = [draft(food, '600'), draft(base, '700', 'grams', 1)]
    const result = calcOk(items, s)
    const dose = doseWarning(result, s)
    expect(dose).not.toBeNull()
    expect(saveWarnings(items, result, s)).toEqual([
      ...items.flatMap((item, index) =>
        itemWarnings(item, result.items[index], s),
      ),
      dose,
    ])
  })
})

// --- The warnings in sight, before "Guardar" (spec §6.6, UX-03) ---

/** calculateMeal on the drafts, as MealForm does, valid or not. */
function calc(items: MealItemDraft[], s: Settings = row) {
  return calculateMeal(items.map(toMealItemInput), toDoseSettings(s))
}

describe('itemWarnings', () => {
  it('an item above the grams alert warns, with its values formatted', () => {
    const item = draft(base, '650')
    expect(itemWarnings(item, calc([item]).items[0], row)).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Banana de prueba',
        grams: '650',
        threshold: '500',
      },
    ])
  })

  it('exactly the alert does not warn', () => {
    const item = draft(base, '500')
    expect(itemWarnings(item, calc([item]).items[0], row)).toEqual([])
  })

  it('an item that is not valid never warns (an empty or incomplete quantity)', () => {
    for (const text of ['', '6.', '0', '-']) {
      const item = draft(base, text)
      expect(itemWarnings(item, calc([item]).items[0], row)).toEqual([])
    }
  })

  it('without the result of its item, none', () => {
    expect(itemWarnings(draft(base, '650'), undefined, row)).toEqual([])
  })

  it('a valid item warns even if another item of the meal is not valid', () => {
    const items = [draft(base, '650', 'grams', 0), draft(base, '', 'grams', 1)]
    const result = calc(items)
    expect(result.ok).toBe(false)
    expect(
      itemWarnings(items[0] as MealItemDraft, result.items[0], row),
    ).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Banana de prueba',
        grams: '650',
        threshold: '500',
      },
    ])
    expect(
      itemWarnings(items[1] as MealItemDraft, result.items[1], row),
    ).toEqual([])
  })

  it('a valid item warns even if the dose of the meal overflows', () => {
    const items = [draft(base, '650')]
    const tiny = { ...row, carb_ratio_g_per_unit: Number.MIN_VALUE }
    const result = calc(items, tiny)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(['INVALID_QUANTITY'])
    expect(
      itemWarnings(items[0] as MealItemDraft, result.items[0], tiny),
    ).toHaveLength(1)
  })

  it('a valid item warns even if the ratio is not valid', () => {
    const items = [draft(base, '650')]
    const zero = { ...row, carb_ratio_g_per_unit: 0 }
    const result = calc(items, zero)
    expect(result.ok).toBe(false)
    expect(
      itemWarnings(items[0] as MealItemDraft, result.items[0], zero),
    ).toHaveLength(1)
  })

  it('units above the alert (11 alfajores of 50 g) warn with the grams eaten', () => {
    const item = draft(alfajor, '11', 'units')
    expect(itemWarnings(item, calc([item]).items[0], row)).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Alfajor de prueba',
        grams: '550',
        threshold: '500',
      },
    ])
  })

  it('an unusual yield warns at any quantity', () => {
    const food = { ...rice, cooking_factor: 4.5 }
    const item = draft(food, '1')
    expect(itemWarnings(item, calc([item]).items[0], row)).toEqual([
      {
        code: 'COOKING_FACTOR_UNUSUAL',
        foodName: 'Arroz de prueba',
        cookedGrams: '450',
      },
    ])
  })

  it('both warnings of one item, in the order of calculateMeal', () => {
    const food = { ...rice, cooking_factor: 0.9, carbs_per_100g: 50 }
    const item = draft(food, '600')
    expect(
      itemWarnings(item, calc([item]).items[0], row).map((w) => w.code),
    ).toEqual(['ITEM_GRAMS_ABOVE_THRESHOLD', 'COOKING_FACTOR_UNUSUAL'])
  })
})

describe('doseWarning', () => {
  it('a dose above the alert warns, with the calculated dose formatted', () => {
    const s = { ...row, max_dose_warning_units: 8 }
    expect(doseWarning(calc(mealOf83(), s), s)).toEqual({
      code: 'DOSE_ABOVE_THRESHOLD',
      dose: '8,55',
      threshold: '8',
    })
  })

  it('a dose equal to the alert does not warn', () => {
    const s = { ...row, max_dose_warning_units: 2 }
    const food = { ...base, carbs_per_100g: 15 }
    expect(doseWarning(calc([draft(food, '200')], s), s)).toBeNull()
  })

  it('without the alert configured, none', () => {
    expect(
      doseWarning(calc(mealOf83(), noDoseThreshold), noDoseThreshold),
    ).toBeNull()
  })

  it('a meal that is not valid never warns: never a partial dose', () => {
    const s = { ...row, max_dose_warning_units: 1 }
    const items = [draft(base, '650', 'grams', 0), draft(base, '', 'grams', 1)]
    const result = calc(items, s)
    expect(result.ok).toBe(false)
    expect(doseWarning(result, s)).toBeNull()
  })

  it('a dose that overflows does not warn', () => {
    const s = { ...row, carb_ratio_g_per_unit: Number.MIN_VALUE }
    expect(doseWarning(calc([draft(base, '650')], s), s)).toBeNull()
  })
})

/**
 * The CHECKs of supabase/migrations/20261112041133_meals.sql, in
 * TypeScript: a saved record has to pass them all. Returns the names of
 * the ones that fail.
 */
function failedChecks(record: NewMealRecord): string[] {
  const failed: string[] = []
  const { meal, items } = record
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.001

  if (!(meal.carb_ratio_g_per_unit > 0)) failed.push('meals.carb_ratio')
  if (!(meal.total_carbs_g >= 0)) failed.push('meals.total_carbs_g')
  if (!(meal.calculated_dose_units >= 0)) failed.push('meals.calculated_dose')
  if (meal.applied_dose_units !== null && !(meal.applied_dose_units >= 0)) {
    failed.push('meals.applied_dose')
  }
  if (!(meal.calc_version.length > 0)) failed.push('meals.calc_version')
  if (
    !near(
      meal.calculated_dose_units,
      meal.total_carbs_g / meal.carb_ratio_g_per_unit,
    )
  ) {
    failed.push('meals_dose_matches_ratio')
  }

  const positions = new Set<number>()
  for (const item of items) {
    const check = (ok: boolean, name: string) => {
      if (!ok) failed.push(`${item.position}: ${name}`)
    }
    check(Number.isInteger(item.position) && item.position >= 0, 'position')
    check(!positions.has(item.position), 'unique position')
    positions.add(item.position)
    check(['label', 'reference', 'manual'].includes(item.food_source), 'source')
    check(['as_eaten', 'raw_cooked'].includes(item.food_state), 'state')
    check(['grams', 'units'].includes(item.quantity_mode), 'quantity_mode')
    check(item.units === null || item.units > 0, 'units')
    check(item.unit_weight_g === null || item.unit_weight_g > 0, 'unit_weight')
    check(item.grams > 0, 'grams')
    check(item.carbs_per_100g >= 0 && item.carbs_per_100g <= 100, 'carbs')
    check(item.cooking_factor === null || item.cooking_factor > 0, 'factor')
    check(
      item.effective_carbs_per_100g >= 0 &&
        item.effective_carbs_per_100g <= 100,
      'effective carbs range',
    )
    check(item.carbs_g >= 0, 'carbs_g')
    check(
      (item.quantity_mode === 'grams' && item.units === null) ||
        (item.quantity_mode === 'units' &&
          item.units !== null &&
          item.unit_weight_g !== null &&
          item.food_state === 'as_eaten'),
      'meal_items_units_fields',
    )
    check(
      (item.food_state === 'raw_cooked') === (item.cooking_factor !== null),
      'meal_items_factor_matches_state',
    )
    check(
      item.quantity_mode === 'grams' ||
        (item.units !== null &&
          item.unit_weight_g !== null &&
          near(item.grams, item.units * item.unit_weight_g)),
      'meal_items_grams_from_units',
    )
    const expectedEffective =
      item.food_state === 'raw_cooked' && item.cooking_factor !== null
        ? item.carbs_per_100g / item.cooking_factor
        : item.carbs_per_100g
    check(
      near(item.effective_carbs_per_100g, expectedEffective),
      'meal_items_effective_carbs',
    )
    check(
      near(item.carbs_g, (item.grams * item.effective_carbs_per_100g) / 100),
      'meal_items_carbs',
    )
  }
  return failed
}

function itemAt(record: NewMealRecord, index: number): NewMealItem {
  const item = record.items[index]
  if (item === undefined) throw new Error(`no item ${index}`)
  return item
}

describe('toNewMealRecord', () => {
  it('copies the §8.3 meal exactly, without rounding', () => {
    const items = mealOf83()
    const result = calcOk(items)
    const record = toNewMealRecord(
      items,
      result,
      row,
      8.546666666666667,
      EATEN_AT,
    )
    expect(record.meal).toEqual({
      eaten_at: EATEN_AT,
      carb_ratio_g_per_unit: 15,
      total_carbs_g: result.totalCarbsG,
      calculated_dose_units: result.doseUnits,
      applied_dose_units: 8.546666666666667,
      calc_version: CALC_VERSION,
    })
    expect(record.meal.total_carbs_g).toBe(result.totalCarbsG)
    expect(record.meal.calculated_dose_units).toBe(result.doseUnits)
    expect(record.items).toHaveLength(3)
  })

  it('has no id, user_id, meal_id, deleted_at or notes', () => {
    const record = toNewMealRecord(
      mealOf83(),
      calcOk(mealOf83()),
      row,
      8,
      EATEN_AT,
    )
    for (const key of ['id', 'user_id', 'deleted_at', 'notes', 'created_at']) {
      expect(Object.keys(record.meal)).not.toContain(key)
    }
    for (const item of record.items) {
      for (const key of ['id', 'user_id', 'meal_id']) {
        expect(Object.keys(item)).not.toContain(key)
      }
    }
  })

  it('saves the applied dose as given, 0 included', () => {
    const items = mealOf83()
    const result = calcOk(items)
    expect(
      toNewMealRecord(items, result, row, 0, EATEN_AT).meal.applied_dose_units,
    ).toBe(0)
    expect(
      toNewMealRecord(items, result, row, 8.5, EATEN_AT).meal
        .applied_dose_units,
    ).toBe(8.5)
  })

  it('the ratio of a non-integer setting is copied exactly', () => {
    const s = { ...row, carb_ratio_g_per_unit: 12.5 }
    const items = mealOf83()
    const result = calcOk(items, s)
    const record = toNewMealRecord(items, result, s, 1, EATEN_AT)
    expect(record.meal.carb_ratio_g_per_unit).toBe(12.5)
    expect(record.meal.calculated_dose_units).toBe(result.totalCarbsG / 12.5)
  })

  it('the rice: cooked grams, its factor, no units', () => {
    const record = toNewMealRecord(
      mealOf83(),
      calcOk(mealOf83()),
      row,
      8,
      EATEN_AT,
    )
    expect(itemAt(record, 0)).toEqual({
      food: { id: rice.id },
      position: 0,
      food_name: 'Arroz de prueba',
      food_brand: null,
      food_source: 'manual',
      food_state: 'raw_cooked',
      quantity_mode: 'grams',
      units: null,
      unit_weight_g: null,
      grams: 250,
      carbs_per_100g: 78,
      cooking_factor: 2.6,
      effective_carbs_per_100g: 78 / 2.6,
      carbs_g: (250 * (78 / 2.6)) / 100,
    })
  })

  it('the banana: no factor', () => {
    const record = toNewMealRecord(
      mealOf83(),
      calcOk(mealOf83()),
      row,
      8,
      EATEN_AT,
    )
    expect(itemAt(record, 1)).toEqual({
      food: { id: base.id },
      position: 1,
      food_name: 'Banana de prueba',
      food_brand: null,
      food_source: 'manual',
      food_state: 'as_eaten',
      quantity_mode: 'grams',
      units: null,
      unit_weight_g: null,
      grams: 120,
      carbs_per_100g: 20.2,
      cooking_factor: null,
      effective_carbs_per_100g: 20.2,
      carbs_g: (120 * 20.2) / 100,
    })
  })

  it('the alfajor in units: units, unit weight, grams and brand', () => {
    const record = toNewMealRecord(
      mealOf83(),
      calcOk(mealOf83()),
      row,
      8,
      EATEN_AT,
    )
    expect(itemAt(record, 2)).toEqual({
      food: { id: alfajor.id },
      position: 2,
      food_name: 'Alfajor de prueba',
      food_brand: 'Marca Inventada',
      food_source: 'manual',
      food_state: 'as_eaten',
      quantity_mode: 'units',
      units: 1,
      unit_weight_g: 50,
      grams: 50,
      carbs_per_100g: 58,
      cooking_factor: null,
      effective_carbs_per_100g: 58,
      carbs_g: 29,
    })
  })

  it('positions are the indexes, from 0', () => {
    const record = toNewMealRecord(
      mealOf83(),
      calcOk(mealOf83()),
      row,
      8,
      EATEN_AT,
    )
    expect(record.items.map((item) => item.position)).toEqual([0, 1, 2])
  })

  it('the positions do not depend on the form keys', () => {
    const items = [
      draft(base, '120', 'grams', 7),
      draft(alfajor, '1', 'units', 3),
    ]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(record.items.map((item) => item.position)).toEqual([0, 1])
  })

  it('the alfajor in grams: no units and no unit weight', () => {
    const items = [draft(alfajor, '75')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0)).toEqual(
      expect.objectContaining({
        quantity_mode: 'grams',
        units: null,
        unit_weight_g: null,
        grams: 75,
      }),
    )
  })

  it('0,5 units keep the typed quantity', () => {
    const items = [draft(alfajor, '0,5', 'units')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0)).toEqual(
      expect.objectContaining({ units: 0.5, unit_weight_g: 50, grams: 25 }),
    )
  })

  it('an as_eaten food with a cooking factor saves the factor as null', () => {
    const food = { ...base, cooking_factor: 2.5 }
    const items = [draft(food, '120')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0).cooking_factor).toBeNull()
    expect(itemAt(record, 0).effective_carbs_per_100g).toBe(20.2)
  })

  it('the same food twice: same food, positions 0 and 1', () => {
    const items = [
      draft(base, '120', 'grams', 0),
      draft(base, '80', 'grams', 1),
    ]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(record.items.map((item) => item.food)).toEqual([
      { id: base.id },
      { id: base.id },
    ])
    expect(record.items.map((item) => item.position)).toEqual([0, 1])
    expect(record.items.map((item) => item.grams)).toEqual([120, 80])
  })

  it('an archived food is saved too', () => {
    const archived = { ...base, archived_at: '2026-11-14T12:00:00+00:00' }
    const items = [draft(archived, '120')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0).food).toEqual({ id: base.id })
  })

  it('copies the source of the food', () => {
    const food = { ...base, source: 'reference' as const }
    const items = [draft(food, '120')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0).food_source).toBe('reference')
  })

  it('does not modify its inputs', () => {
    const items = mealOf83()
    const result = calcOk(items)
    const before = structuredClone({ items, result, row })
    toNewMealRecord(items, result, row, 8, EATEN_AT)
    expect({ items, result, row }).toEqual(before)
  })

  it('throws if the result does not match the items', () => {
    const result = calcOk(mealOf83())
    expect(() =>
      toNewMealRecord(mealOf83().slice(0, 2), result, row, 8, EATEN_AT),
    ).toThrow()
    expect(() =>
      toNewMealRecord(
        [...mealOf83(), draft(base, '1', 'grams', 9)],
        result,
        row,
        8,
        EATEN_AT,
      ),
    ).toThrow()
  })
})

describe('toNewMealRecord passes the CHECKs of the base', () => {
  it('the §8.3 meal', () => {
    const items = mealOf83()
    const result = calcOk(items)
    expect(
      failedChecks(
        toNewMealRecord(items, result, row, result.doseUnits, EATEN_AT),
      ),
    ).toEqual([])
  })

  it('the helper catches a broken record', () => {
    const items = mealOf83()
    const record = toNewMealRecord(items, calcOk(items), row, 8, EATEN_AT)
    const broken: NewMealRecord = {
      meal: { ...record.meal, total_carbs_g: record.meal.total_carbs_g + 1 },
      items: [
        { ...itemAt(record, 0), cooking_factor: null },
        { ...itemAt(record, 1), position: 0 },
        { ...itemAt(record, 2), grams: 51 },
      ],
    }
    expect(failedChecks(broken)).toEqual([
      'meals_dose_matches_ratio',
      '0: meal_items_factor_matches_state',
      '0: meal_items_effective_carbs',
      '0: unique position',
      '2: meal_items_grams_from_units',
      '2: meal_items_carbs',
    ])
  })

  const ratios = [15, 12.5, 1, 0.5, 33.3]
  const foods: Food[] = [
    base,
    rice,
    { ...rice, cooking_factor: 1 },
    { ...rice, cooking_factor: 4 },
    { ...rice, cooking_factor: 0.9, carbs_per_100g: 50 },
    alfajor,
    { ...base, carbs_per_100g: 0 },
    { ...base, carbs_per_100g: 100 },
    { ...base, carbs_per_100g: 0.1 + 0.2 },
    { ...alfajor, unit_weight_g: 0.1 },
    { ...alfajor, unit_weight_g: 33.33 },
  ]
  const quantities = ['0,1', '0,5', '1', '3', '120', '250', '1.234,567']

  it.each(ratios)('every combination with ratio %s', (ratio) => {
    const s = { ...row, carb_ratio_g_per_unit: ratio }
    for (const food of foods) {
      for (const quantity of quantities) {
        const modes = canUseUnits(food)
          ? (['grams', 'units'] as const)
          : (['grams'] as const)
        for (const mode of modes) {
          const items = [
            draft(food, quantity, mode, 0),
            draft(base, '120', 'grams', 1),
          ]
          const result = calcOk(items, s)
          const record = toNewMealRecord(
            items,
            result,
            s,
            result.doseUnits,
            EATEN_AT,
          )
          expect(failedChecks(record)).toEqual([])
        }
      }
    }
  })

  it('an applied dose of 0 passes', () => {
    const items = mealOf83()
    expect(
      failedChecks(toNewMealRecord(items, calcOk(items), row, 0, EATEN_AT)),
    ).toEqual([])
  })

  it('a meal of foods without carbs (dose 0) passes', () => {
    const food = { ...base, carbs_per_100g: 0 }
    const items = [draft(food, '120')]
    const result = calcOk(items)
    expect(result.doseUnits).toBe(0)
    expect(
      failedChecks(toNewMealRecord(items, result, row, 0, EATEN_AT)),
    ).toEqual([])
  })

  it('many items keep the total within the tolerance', () => {
    const items = Array.from({ length: 40 }, (_, index) =>
      draft(index % 2 === 0 ? base : rice, '123,45', 'grams', index),
    )
    const result = calcOk(items)
    const record = toNewMealRecord(
      items,
      result,
      row,
      result.doseUnits,
      EATEN_AT,
    )
    expect(failedChecks(record)).toEqual([])
    expect(record.items.map((item) => item.position)).toEqual(
      items.map((_, index) => index),
    )
  })
})

// --- Edge cases added by the tester ---

describe('toNewMealRecord, edge cases', () => {
  it('a meal with one item', () => {
    const items = [draft(base, '120', 'grams', 5)]
    const result = calcOk(items)
    const record = toNewMealRecord(items, result, row, 1.5, EATEN_AT)
    expect(record.items).toHaveLength(1)
    expect(itemAt(record, 0).position).toBe(0)
    expect(record.meal.total_carbs_g).toBe(itemAt(record, 0).carbs_g)
    expect(record.meal.calculated_dose_units).toBe(result.doseUnits)
    expect(record.meal.applied_dose_units).toBe(1.5)
    expect(record.meal.eaten_at).toBe(EATEN_AT)
    expect(failedChecks(record)).toEqual([])
  })

  it('a meal with 100 items of every kind', () => {
    const foods = [base, rice, alfajor]
    const items = Array.from({ length: 100 }, (_, index) => {
      const food = foods[index % 3] ?? base
      const mode = food === alfajor && index % 2 === 0 ? 'units' : 'grams'
      return draft(food, mode === 'units' ? '1,5' : '87,3', mode, 1000 - index)
    })
    const result = calcOk(items, noDoseThreshold)
    const record = toNewMealRecord(
      items,
      result,
      noDoseThreshold,
      result.doseUnits,
      EATEN_AT,
    )
    expect(record.items).toHaveLength(100)
    expect(record.items.map((item) => item.position)).toEqual(
      Array.from({ length: 100 }, (_, index) => index),
    )
    // Each item keeps its food, in the order of the form.
    expect(record.items.map((item) => item.food)).toEqual(
      items.map((item) => ({ id: item.food.id })),
    )
    expect(record.items.map((item) => item.carbs_g)).toEqual(
      result.items.map((item) => item.carbsG),
    )
    expect(record.items.map((item) => item.quantity_mode)).toContain('units')
    expect(failedChecks(record)).toEqual([])
  })

  it.each([7.3, 0.1, 33.333, 1e-3, 1234.5678])(
    'a ratio of %s is copied exactly and passes the CHECKs',
    (ratio) => {
      const s = { ...row, carb_ratio_g_per_unit: ratio }
      const items = mealOf83()
      const result = calcOk(items, s)
      const record = toNewMealRecord(items, result, s, 0, EATEN_AT)
      expect(record.meal.carb_ratio_g_per_unit).toBe(ratio)
      expect(record.meal.calculated_dose_units).toBe(result.doseUnits)
      expect(record.meal.calculated_dose_units).toBe(result.totalCarbsG / ratio)
      expect(failedChecks(record)).toEqual([])
    },
  )

  it('a raw_cooked food with a factor below 1 keeps it, unrounded', () => {
    const food = { ...rice, carbs_per_100g: 70, cooking_factor: 0.8 }
    const items = [draft(food, '133,3')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0)).toEqual(
      expect.objectContaining({
        food_state: 'raw_cooked',
        quantity_mode: 'grams',
        units: null,
        unit_weight_g: null,
        grams: 133.3,
        carbs_per_100g: 70,
        cooking_factor: 0.8,
        effective_carbs_per_100g: 70 / 0.8,
        carbs_g: (133.3 * (70 / 0.8)) / 100,
      }),
    )
    expect(itemAt(record, 0).effective_carbs_per_100g).toBeGreaterThan(70)
    expect(failedChecks(record)).toEqual([])
  })

  it('a factor below 1 that gives exactly 100 g/100 g passes', () => {
    const food = { ...rice, carbs_per_100g: 80, cooking_factor: 0.8 }
    const items = [draft(food, '50')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0).effective_carbs_per_100g).toBeCloseTo(100, 12)
    expect(failedChecks(record)).toEqual([])
  })

  it('a factor with many decimals is copied exactly', () => {
    const food = { ...rice, cooking_factor: 2.6180339887 }
    const items = [draft(food, '250')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0).cooking_factor).toBe(2.6180339887)
    expect(itemAt(record, 0).effective_carbs_per_100g).toBe(78 / 2.6180339887)
  })

  it('the applied dose typed in the field goes through as typed', () => {
    const items = mealOf83()
    const result = calcOk(items)
    const typed: [string, number][] = [
      ['8,5', 8.5],
      ['0', 0],
      ['1.234,5', 1234.5],
      ['8,546', 8.546],
    ]
    for (const [text, value] of typed) {
      const applied = appliedDose(text, result.doseUnits)
      if (!('value' in applied)) throw new Error(`expected a value: ${text}`)
      expect(
        toNewMealRecord(items, result, row, applied.value, EATEN_AT).meal
          .applied_dose_units,
      ).toBe(value)
    }
  })

  it('an untouched applied dose saves the calculated one, unrounded', () => {
    const items = mealOf83()
    const result = calcOk(items)
    const applied = appliedDose(null, result.doseUnits)
    if (!('value' in applied)) throw new Error('expected a value')
    const record = toNewMealRecord(items, result, row, applied.value, EATEN_AT)
    expect(record.meal.applied_dose_units).toBe(result.doseUnits)
    expect(record.meal.applied_dose_units).not.toBe(8.55)
    // What the field shows is the rounded one.
    expect(appliedDoseFieldText(null, result)).toBe('8,55')
  })

  it('units with a decimal unit weight pass the CHECKs', () => {
    const food = { ...alfajor, unit_weight_g: 12.34 }
    const items = [draft(food, '3,5', 'units')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0)).toEqual(
      expect.objectContaining({ units: 3.5, unit_weight_g: 12.34 }),
    )
    expect(itemAt(record, 0).grams).toBe(3.5 * 12.34)
    expect(failedChecks(record)).toEqual([])
  })

  it('an as_eaten food with a factor loaded, in units: factor null', () => {
    const food = { ...alfajor, cooking_factor: 3 }
    const items = [draft(food, '2', 'units')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0)).toEqual(
      expect.objectContaining({
        quantity_mode: 'units',
        units: 2,
        unit_weight_g: 50,
        cooking_factor: null,
      }),
    )
    expect(failedChecks(record)).toEqual([])
  })

  it('the eaten_at instant is copied as given', () => {
    const items = mealOf83()
    for (const instant of [
      '2026-11-14T16:05:00.000Z',
      '2030-06-15T15:00:00.000Z',
      '2000-02-29T13:00:00.000Z',
    ]) {
      expect(
        toNewMealRecord(items, calcOk(items), row, 1, instant).meal.eaten_at,
      ).toBe(instant)
    }
  })

  it('the keys of the record are exactly the columns it fills', () => {
    const record = toNewMealRecord(
      mealOf83(),
      calcOk(mealOf83()),
      row,
      8,
      EATEN_AT,
    )
    expect(Object.keys(record.meal).sort()).toEqual([
      'applied_dose_units',
      'calc_version',
      'calculated_dose_units',
      'carb_ratio_g_per_unit',
      'eaten_at',
      'total_carbs_g',
    ])
    for (const item of record.items) {
      expect(Object.keys(item).sort()).toEqual([
        'carbs_g',
        'carbs_per_100g',
        'cooking_factor',
        'effective_carbs_per_100g',
        'food',
        'food_brand',
        'food_name',
        'food_source',
        'food_state',
        'grams',
        'position',
        'quantity_mode',
        'unit_weight_g',
        'units',
      ])
    }
  })
})

describe('saveWarnings, edge cases', () => {
  it('factors of exactly 1 and 4 do not warn; 0,99 and 4,01 do', () => {
    const s = noDoseThreshold
    for (const factor of [1, 4]) {
      const items = [draft({ ...rice, cooking_factor: factor }, '100')]
      expect(saveWarnings(items, calcOk(items, s), s)).toEqual([])
    }
    // 4,0004 is unusual but is shown as "400", inside the usual range said
    // in the message (accepted, spec §14 #52).
    const unusual: [number, string][] = [
      [0.99, '99'],
      [4.01, '401'],
      [0.9, '90'],
      [4.5, '450'],
      [4.0004, '400'],
    ]
    for (const [factor, shown] of unusual) {
      const items = [draft({ ...rice, cooking_factor: factor }, '100')]
      expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
        {
          code: 'COOKING_FACTOR_UNUSUAL',
          foodName: 'Arroz de prueba',
          cookedGrams: shown,
        },
      ])
    }
  })

  it('a dose just above the threshold warns', () => {
    // 15 g/100 g × 200,1 g = 30,015 g; ÷ 15 = 2,001 U > 2.
    const s = { ...row, max_dose_warning_units: 2 }
    const food = { ...base, carbs_per_100g: 15 }
    const items = [draft(food, '200,1')]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
      { code: 'DOSE_ABOVE_THRESHOLD', dose: '2,00', threshold: '2' },
    ])
  })

  it('a dose threshold of 0 warns for any dose above 0, not for 0', () => {
    const s = { ...row, max_dose_warning_units: 0 }
    const items = [draft(base, '1')]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
      { code: 'DOSE_ABOVE_THRESHOLD', dose: '0,01', threshold: '0' },
    ])
    const zero = [draft({ ...base, carbs_per_100g: 0 }, '100')]
    expect(saveWarnings(zero, calcOk(zero, s), s)).toEqual([])
  })

  it('one item with both item warnings gives them in the calculation order', () => {
    const s = noDoseThreshold
    const food = { ...rice, cooking_factor: 0.9, carbs_per_100g: 50 }
    const items = [draft(food, '501')]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Arroz de prueba',
        grams: '501',
        threshold: '500',
      },
      {
        code: 'COOKING_FACTOR_UNUSUAL',
        foodName: 'Arroz de prueba',
        cookedGrams: '90',
      },
    ])
  })

  it('units above the grams threshold show the eaten grams, not the units', () => {
    const s = noDoseThreshold
    const items = [draft(alfajor, '10,5', 'units')]
    expect(saveWarnings(items, calcOk(items, s), s)).toEqual([
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Alfajor de prueba',
        grams: '525',
        threshold: '500',
      },
    ])
  })
})

describe('the CHECK mirror itself', () => {
  // Its operators and tolerance are those of the migration: <= 0.001, > 0,
  // >= 0 and between 0 and 100 (both ends included).
  function oneItem(): NewMealRecord {
    const items = [draft(base, '120')]
    return toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
  }

  it('a difference just under the tolerance passes; just over, fails', () => {
    const record = oneItem()
    const item = itemAt(record, 0)
    const under: NewMealRecord = {
      ...record,
      items: [{ ...item, carbs_g: item.carbs_g + 0.0009 }],
    }
    expect(failedChecks(under)).toEqual([])
    const over: NewMealRecord = {
      ...record,
      items: [{ ...item, carbs_g: item.carbs_g + 0.0011 }],
    }
    expect(failedChecks(over)).toEqual(['0: meal_items_carbs'])
  })

  it('carbs of 0 and 100 per 100 g pass; above 100, fails', () => {
    const record = oneItem()
    const item = itemAt(record, 0)
    for (const carbs of [0, 100]) {
      const ok: NewMealRecord = {
        ...record,
        items: [
          {
            ...item,
            carbs_per_100g: carbs,
            effective_carbs_per_100g: carbs,
            carbs_g: (item.grams * carbs) / 100,
          },
        ],
      }
      expect(failedChecks(ok)).toEqual([])
    }
    const above: NewMealRecord = {
      ...record,
      items: [{ ...item, carbs_per_100g: 100.5 }],
    }
    expect(failedChecks(above)).toContain('0: carbs')
  })

  it('values of 0 that the CHECKs reject, and the dose of 0 they accept', () => {
    const record = oneItem()
    const item = itemAt(record, 0)
    const withItem = (change: Partial<NewMealItem>): string[] =>
      failedChecks({ ...record, items: [{ ...item, ...change }] })
    const withMeal = (change: Partial<NewMealRecord['meal']>): string[] =>
      failedChecks({ ...record, meal: { ...record.meal, ...change } })
    expect(withItem({ grams: 0, carbs_g: 0 })).toContain('0: grams')
    expect(withItem({ units: 0 })).toContain('0: units')
    expect(withItem({ unit_weight_g: 0 })).toContain('0: unit_weight')
    expect(withItem({ cooking_factor: 0 })).toContain('0: factor')
    expect(withItem({ position: -1 })).toContain('-1: position')
    expect(withMeal({ applied_dose_units: 0 })).toEqual([])
    expect(withMeal({ applied_dose_units: null })).toEqual([])
    expect(withMeal({ applied_dose_units: -0.1 })).toEqual([
      'meals.applied_dose',
    ])
    expect(withMeal({ calc_version: '' })).toEqual(['meals.calc_version'])
  })
})

describe('a food of the reference table (spec §6.2, §14 #51)', () => {
  // Invented code and values.
  const tableBanana = tableFoodAsMealFood({
    reference_db: 'usda_fdc',
    reference_code: '900001',
    description_original: 'Invented banana',
    name_es: 'Banana',
    state: 'as_eaten',
    carbs_per_100g: 20.229999999999997,
  })

  function tableDraft(quantityText: string, key = 0): MealItemDraft {
    return { ...newItemDraft(key, tableBanana), quantityText }
  }

  it('newItemDraft: in grams, with the quantity empty', () => {
    expect(newItemDraft(4, tableBanana)).toEqual({
      key: 4,
      food: tableBanana,
      quantityMode: 'grams',
      quantityText: '',
    })
  })

  it('toNewMealRecord: the item carries the copy, not an id', () => {
    const items = [tableDraft('120')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0)).toEqual({
      food: {
        copy: {
          name: 'Banana',
          brand: null,
          source: 'reference',
          state: 'as_eaten',
          carbs_per_100g: 20.229999999999997,
          reference_db: 'usda_fdc',
          reference_code: '900001',
          reference_description: 'Invented banana',
        },
      },
      position: 0,
      food_name: 'Banana',
      food_brand: null,
      food_source: 'reference',
      food_state: 'as_eaten',
      quantity_mode: 'grams',
      units: null,
      unit_weight_g: null,
      grams: 120,
      carbs_per_100g: 20.229999999999997,
      cooking_factor: null,
      effective_carbs_per_100g: 20.229999999999997,
      carbs_g: (120 * 20.229999999999997) / 100,
    })
    expect(failedChecks(record)).toEqual([])
  })

  it('the same entry twice: two items with the same copy', () => {
    const items = [tableDraft('120', 0), tableDraft('80', 1)]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    const [first, second] = record.items
    expect(first?.food).toEqual(second?.food)
    expect(record.items.map((item) => item.grams)).toEqual([120, 80])
  })

  it('a mixed meal: the catalog foods keep their id', () => {
    const items = [
      draft(rice, '250'),
      tableDraft('120', 1),
      draft(base, '50', 'grams', 2),
    ]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(record.items.map((item) => item.food)).toEqual([
      { id: rice.id },
      { copy: expect.objectContaining({ reference_code: '900001' }) },
      { id: base.id },
    ])
    expect(failedChecks(record)).toEqual([])
  })

  it('a copy already in the catalog (with id) is saved with its id', () => {
    const copy: Food = {
      ...tableBanana,
      id: 'c0000000-0000-4000-8000-000000000001',
    }
    const items = [draft(copy, '120')]
    const record = toNewMealRecord(items, calcOk(items), row, 1, EATEN_AT)
    expect(itemAt(record, 0).food).toEqual({ id: copy.id })
    expect(itemAt(record, 0).food_source).toBe('reference')
  })
})

// "Corregir" (spec §6.7): while a field keeps the text it was loaded with,
// the exact loaded value is saved.
describe('appliedDose with a loaded value', () => {
  const loaded = { text: '8,55', value: 8.546666666666667 }

  it('the field as it was loaded: the exact value', () => {
    expect(appliedDose('8,55', 10, loaded)).toEqual({
      value: 8.546666666666667,
    })
  })

  it('edited: what was typed, even if it is the same number', () => {
    expect(appliedDose('8,5', 10, loaded)).toEqual({ value: 8.5 })
    expect(appliedDose('8,550', 10, loaded)).toEqual({ value: 8.55 })
    expect(appliedDose('', 10, loaded)).toEqual({ error: 'REQUIRED' })
  })

  it('following the calculated dose (null) wins over the loaded value', () => {
    expect(appliedDose(null, 10, loaded)).toEqual({ value: 10 })
  })

  it('without a loaded value, as before', () => {
    expect(appliedDose('8,55', 10, null)).toEqual({ value: 8.55 })
  })
})

describe('eatenAtToSave', () => {
  const now = new Date('2026-11-16T16:00:30.500Z')
  const loaded = {
    text: '2026-11-15T08:30',
    value: '2026-11-15T11:30:45.123+00:00',
  }

  it('"Ahora": the instant of saving', () => {
    expect(eatenAtToSave(null, now)).toBe('2026-11-16T16:00:30.500Z')
    expect(eatenAtToSave(null, now, loaded)).toBe('2026-11-16T16:00:30.500Z')
  })

  it('the field as it was loaded: the exact instant, with its seconds', () => {
    expect(eatenAtToSave('2026-11-15T08:30', now, loaded)).toBe(loaded.value)
  })

  it('changed: the typed date and time, in Buenos Aires', () => {
    expect(eatenAtToSave('2026-11-15T08:31', now, loaded)).toBe(
      '2026-11-15T11:31:00.000Z',
    )
    expect(eatenAtToSave('2026-11-15T08:30', now)).toBe(
      '2026-11-15T11:30:00.000Z',
    )
  })

  it('not a real date: null', () => {
    expect(eatenAtToSave('', now, loaded)).toBeNull()
    expect(eatenAtToSave('2026-02-30T08:30', now)).toBeNull()
  })
})
