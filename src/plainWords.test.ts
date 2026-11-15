import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  calculateMeal,
  type ItemErrorCode,
  type MealItemInput,
  type PositiveNumberError,
  type TypedNumberNotice,
} from './domain/dose/index.ts'
import {
  carbsLabel,
  unitLine,
  unusualYieldText,
  yieldLine,
} from './features/foods/foodForm.ts'
import {
  doseLine,
  doseText,
  foodCarbsLine,
  foodLines,
  foodYieldLine,
  itemCalculationLines,
  itemCarbsText,
  savedItemLines,
  totalCarbsText,
} from './features/meals/breakdown.ts'
import { appliedDoseText, mealSummaryText } from './features/meals/history.ts'
import { SETTINGS_FIELDS } from './features/settings/fields.ts'
import * as errors from './lib/errors.ts'
import { TABLE_VALUE_INFO, cookedPer100gText } from './lib/foodText.ts'

// Plain words on the screen (CLAUDE.md rule 4, spec §14 #48 and #52): no
// text the app shows says "factor", "estado", "asimilables", where a food
// came from (the reference database, USDA, ARGENFOODS, its code), "ítem" or
// "g/100". It checks the texts built by pure functions and constants; the
// ones written inside components are checked by hand.
// The USDA attribution (stage 6b, feature 5) names the database on
// purpose: it is left out of this list.

const TECHNICAL =
  /factor|estado|asimilable|referencia|usda|argenfoods|fuente|c[oó]digo|ítem|\bitem\b|g\/100/i

function expectPlain(texts: readonly (string | null)[]) {
  for (const text of texts) {
    if (text === null) continue
    expect(text, text).not.toMatch(TECHNICAL)
  }
}

const settings = {
  carbRatioGPerUnit: 12.5,
  maxDoseWarningUnits: 5,
  maxItemGramsWarning: 500,
}

const inputs: MealItemInput[] = [
  {
    foodState: 'as_eaten',
    carbsPer100g: 20.2,
    cookingFactor: null,
    unitWeightG: null,
    quantityMode: 'grams',
    quantity: 120,
  },
  {
    foodState: 'raw_cooked',
    carbsPer100g: 78,
    cookingFactor: 2.6,
    unitWeightG: null,
    quantityMode: 'grams',
    quantity: 250,
  },
  {
    foodState: 'raw_cooked',
    carbsPer100g: 50,
    cookingFactor: 1e307,
    unitWeightG: null,
    quantityMode: 'grams',
    quantity: 250,
  },
  {
    foodState: 'as_eaten',
    carbsPer100g: 58,
    cookingFactor: null,
    unitWeightG: 45,
    quantityMode: 'units',
    quantity: 0.5,
  },
]

describe('plain words on the screen', () => {
  it('error messages and notices', () => {
    const positive: PositiveNumberError[] = [
      'REQUIRED',
      'INVALID_NUMBER',
      'NOT_POSITIVE',
    ]
    const foodFields: errors.FoodFieldError[] = [
      ...positive,
      'ABOVE_100',
      'STATE_REQUIRED',
      'UNIT_WEIGHT_REQUIRED',
      'FACTOR_NOT_COMPUTABLE',
    ]
    const items: Exclude<ItemErrorCode, 'INVALID_QUANTITY'>[] = [
      'INVALID_CARBS',
      'MISSING_COOKING_FACTOR',
      'INVALID_COOKING_FACTOR',
      'MISSING_UNIT_WEIGHT',
      'UNITS_NOT_ALLOWED_FOR_RAW_COOKED',
      'EFFECTIVE_CARBS_OVER_100',
    ]
    const notices: TypedNumberNotice[] = ['DECIMAL_DOT', 'REJECTED']
    expectPlain([
      ...positive.map(errors.positiveNumberErrorMessage),
      ...foodFields.map(errors.foodFieldErrorMessage),
      ...items.map(errors.mealItemErrorMessage),
      ...notices.map(errors.typedNumberNoticeMessage),
      errors.cookingFactorUnusualMessage('90'),
      errors.cookingFactorUnusualMessage('450'),
    ])
  })

  it('the save warnings of a meal', () => {
    const warnings: errors.MealSaveWarning[] = [
      {
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Arroz',
        grams: '600',
        threshold: '500',
      },
      { code: 'COOKING_FACTOR_UNUSUAL', foodName: 'Arroz', cookedGrams: '450' },
      { code: 'COOKING_FACTOR_UNUSUAL', foodName: 'Arroz', cookedGrams: '90' },
      { code: 'COOKING_FACTOR_UNUSUAL', foodName: 'Arroz', cookedGrams: null },
      { code: 'DOSE_ABOVE_THRESHOLD', dose: '8,55', threshold: '8' },
    ]
    expectPlain(warnings.map(errors.mealSaveWarningMessage))
  })

  it('the sign in messages', () => {
    expectPlain([
      errors.authErrorMessage(new Error('x')),
      errors.authErrorMessage(
        new AuthApiError('x', 400, 'invalid_credentials'),
      ),
      errors.authErrorMessage(
        new AuthApiError('x', 429, 'over_request_rate_limit'),
      ),
      errors.authErrorMessage(new AuthRetryableFetchError('x', 0)),
    ])
  })

  it('every *_MESSAGE constant', () => {
    const messages = Object.entries(errors)
      .filter(([name]) => name.endsWith('_MESSAGE'))
      .map(([, value]) => value)
    expect(messages.length).toBeGreaterThan(0)
    for (const message of messages) expect(typeof message).toBe('string')
    expectPlain(messages.filter((value) => typeof value === 'string'))
  })

  it('the texts of a food', () => {
    expectPlain([
      TABLE_VALUE_INFO,
      ...[2.6, 0.9, 4.5, 8 / 3, 1e307].map(cookedPer100gText),
      carbsLabel(null),
      carbsLabel('as_eaten'),
      carbsLabel('raw_cooked'),
      yieldLine({ rawWeight: '100', cookedWeight: '260' }),
      unitLine({ unitWeight: '45', unitLabel: 'alfajor' }),
      unitLine({ unitWeight: '45', unitLabel: '' }),
      unusualYieldText(4.5),
      unusualYieldText(0.9),
    ])
  })

  it('the meal breakdown, in sight and inside "Ver la cuenta"', () => {
    const result = calculateMeal(inputs, settings)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const texts: (string | null)[] = []
    inputs.forEach((input, index) => {
      const calc = result.items[index]
      if (calc === undefined) throw new Error('missing')
      const food = {
        state: input.foodState,
        carbs_per_100g: input.carbsPer100g ?? 0,
        cooking_factor: input.cookingFactor,
      }
      texts.push(
        foodCarbsLine(food),
        foodYieldLine(food),
        ...foodLines(food),
        ...itemCalculationLines(input, calc),
        itemCarbsText(calc.carbsG),
        ...savedItemLines({
          position: index,
          food_name: 'Alimento',
          food_brand: null,
          food_state: input.foodState,
          quantity_mode: input.quantityMode,
          units: input.quantityMode === 'units' ? input.quantity : null,
          unit_weight_g:
            input.quantityMode === 'units' ? input.unitWeightG : null,
          grams: calc.grams,
          carbs_per_100g: input.carbsPer100g ?? 0,
          cooking_factor: input.cookingFactor,
          effective_carbs_per_100g: calc.effectiveCarbsPer100g,
          carbs_g: calc.carbsG,
        }),
      )
    })
    texts.push(
      totalCarbsText(result.totalCarbsG),
      doseText(result.doseUnits),
      doseLine(result.totalCarbsG, 12.5, result.doseUnits),
    )
    expectPlain(texts)
  })

  it('the history', () => {
    expectPlain([
      appliedDoseText(null),
      appliedDoseText(8.5),
      mealSummaryText({
        id: '00000000-0000-4000-8000-000000000001',
        eaten_at: '2026-11-14T16:05:00.000Z',
        total_carbs_g: 128.2,
        calculated_dose_units: 8.55,
        applied_dose_units: null,
      }),
    ])
  })

  it('the settings labels and their ⓘ', () => {
    expectPlain(
      SETTINGS_FIELDS.flatMap(({ label, info }) => [label, info ?? null]),
    )
  })

  it('the check itself catches the words it looks for', () => {
    for (const text of [
      'Factor de cocción',
      'Estado',
      'HC asimilables',
      'Tabla de referencia',
      'USDA FoodData Central',
      'ARGENFOODS',
      'Fuente',
      'Código: 123',
      'Codigo',
      'por ítem',
      'item',
      'HC 20,2 g/100 g',
    ]) {
      expect(text).toMatch(TECHNICAL)
    }
  })
})

// Exhaustive lists: a new code that is not added here is a type error, so
// its message cannot escape the check above.
describe('plain words: every code, exhaustively', () => {
  const foodFieldCodes: Record<errors.FoodFieldError, true> = {
    REQUIRED: true,
    INVALID_NUMBER: true,
    NOT_POSITIVE: true,
    ABOVE_100: true,
    STATE_REQUIRED: true,
    UNIT_WEIGHT_REQUIRED: true,
    FACTOR_NOT_COMPUTABLE: true,
  }
  const itemCodes: Record<errors.MealItemFoodError, true> = {
    INVALID_CARBS: true,
    MISSING_COOKING_FACTOR: true,
    INVALID_COOKING_FACTOR: true,
    MISSING_UNIT_WEIGHT: true,
    UNITS_NOT_ALLOWED_FOR_RAW_COOKED: true,
    EFFECTIVE_CARBS_OVER_100: true,
  }
  const noticeCodes: Record<TypedNumberNotice, true> = {
    DECIMAL_DOT: true,
    REJECTED: true,
  }
  const warningCodes: Record<errors.MealSaveWarning['code'], true> = {
    ITEM_GRAMS_ABOVE_THRESHOLD: true,
    COOKING_FACTOR_UNUSUAL: true,
    DOSE_ABOVE_THRESHOLD: true,
  }

  it('food field errors', () => {
    const codes = Object.keys(foodFieldCodes) as errors.FoodFieldError[]
    expectPlain(codes.map(errors.foodFieldErrorMessage))
  })

  it('meal item errors', () => {
    const codes = Object.keys(itemCodes) as errors.MealItemFoodError[]
    expectPlain(codes.map(errors.mealItemErrorMessage))
  })

  it('typed number notices', () => {
    const codes = Object.keys(noticeCodes) as TypedNumberNotice[]
    expectPlain(codes.map(errors.typedNumberNoticeMessage))
  })

  it('the warning codes are the three of spec §8.5', () => {
    expect(Object.keys(warningCodes)).toHaveLength(3)
  })

  it('every exported string of errors.ts, not only *_MESSAGE', () => {
    const values: unknown[] = Object.values(errors)
    const strings = values.filter(
      (value): value is string => typeof value === 'string',
    )
    expect(strings.length).toBeGreaterThan(0)
    expectPlain(strings)
  })
})
