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
  displayCarbsText,
  doseLine,
  doseText,
  foodCarbsLine,
  foodLines,
  foodYieldLine,
  itemCalculationLines,
  itemCarbsText,
  ratioText,
  savedItemLines,
  totalCarbsText,
} from './features/meals/breakdown.ts'
import {
  carbsLine,
  columnOptionText,
  ENERGY_CONFIRMATION_TEXT,
  energyWarning,
  fieldNote,
  initialLabelFormTexts,
  nameNote,
} from './features/foods/labelForm.ts'
import { formatDayTitle } from './features/meals/eatenAt.ts'
import {
  appliedDoseText,
  daySummaryText,
  mealSummaryText,
} from './features/meals/history.ts'
import {
  ALERT_FIELDS,
  RATIO_LABEL_REST,
  RATIO_PHRASE_END,
  RATIO_PHRASE_START,
} from './features/settings/fields.ts'
import {
  ratioChangeTexts,
  ratioExampleText,
  ratioSavedText,
} from './features/settings/ratio.ts'
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

const mealProblems: errors.MealProblem[] = [
  { code: 'QUANTITY', foodName: 'Banana', error: 'REQUIRED' },
  { code: 'QUANTITY', foodName: 'Banana', error: 'NOT_POSITIVE' },
  { code: 'FOOD', foodName: 'Banana' },
  { code: 'APPLIED_DOSE', error: 'REQUIRED' },
  { code: 'APPLIED_DOSE', error: 'INVALID_NUMBER' },
  { code: 'EATEN_AT', empty: true },
  { code: 'EATEN_AT', empty: false },
  { code: 'MEAL' },
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
      'NAME_REQUIRED',
      'STATE_REQUIRED',
      'UNIT_WEIGHT_REQUIRED',
      'FACTOR_NOT_COMPUTABLE',
      'CARBS_EXCEED_PORTION',
      'FIBER_EXCEEDS_CARBS',
      'COLUMN_REQUIRED',
      'BASIS_REQUIRED',
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
      ...foodFields.map((code) => errors.foodFieldErrorMessage(code)),
      ...items.map(errors.mealItemErrorMessage),
      ...notices.map(errors.typedNumberNoticeMessage),
      ...errors.VISION_ERROR_CODES.map(errors.visionErrorMessage),
      errors.cookingFactorUnusualMessage('90'),
      errors.cookingFactorUnusualMessage('450'),
      ...positive.flatMap((code) => [
        errors.quantityErrorMessage(code, 'grams'),
        errors.quantityErrorMessage(code, 'units'),
        errors.ratioErrorMessage(code),
      ]),
      ...(
        [
          'carbsPer100g',
          'rawWeight',
          'cookedWeight',
          'portion',
          'portionCarbs',
        ] as const
      ).map((field) => errors.foodFieldErrorMessage('REQUIRED', field)),
      errors.appliedDoseErrorMessage('REQUIRED'),
      errors.appliedDoseErrorMessage('INVALID_NUMBER'),
      ...mealProblems.map(errors.mealProblemMessage),
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
    expectPlain(
      warnings.map((warning) => {
        const { before, strong, after } = errors.mealSaveWarningMessage(warning)
        return `${before}${strong}${after}`
      }),
    )
    expectPlain(warnings.map(errors.mealLiveWarningMessage))
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

  it('the texts of the label confirmation', () => {
    const legible = (text: string) => ({ status: 'legible' as const, text })
    const illegible = { status: 'illegible' as const, text: null }
    const absent = { status: 'not_present' as const, text: null }
    const column = {
      basis: 'per_portion' as const,
      header_text: 'Porción',
      state: 'prepared' as const,
      state_text: 'preparado',
      portion_size_g: legible('50 g'),
      portion_description: legible('1 alfajor'),
      carbohydrates_g: legible('38'),
      energy: legible('190 kcal'),
    }
    const transcription = {
      is_nutrition_label: true,
      product_name: illegible,
      brand: absent,
      carbohydrate_row_label: legible('Total Carbohydrate'),
      columns: [column],
      observations: null,
    }
    const texts = {
      ...initialLabelFormTexts(transcription),
      fiber: '3',
    }
    expectPlain([
      fieldNote(legible('50 g')),
      fieldNote(legible('<0,5')),
      fieldNote(illegible),
      fieldNote(absent),
      nameNote(transcription),
      columnOptionText(column, 0),
      columnOptionText({ ...column, header_text: null, state_text: null }, 1),
      carbsLine(texts, transcription),
      carbsLine({ ...texts, state: 'raw_cooked' }, transcription),
      carbsLine(
        { ...texts, basis: 'per_100g', labelCarbs: '78' },
        transcription,
      ),
    ])

    // 38 g of carbs in 107 kcal: the calories warning shows.
    const lowEnergy = {
      ...transcription,
      columns: [{ ...column, energy: legible('107 kcal = 449 kJ') }],
    }
    const warning = energyWarning({ ...texts, fiber: '' }, lowEnergy)
    expect(warning).not.toBeNull()
    expectPlain([warning, ENERGY_CONFIRMATION_TEXT])
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
          food_id: '00000000-0000-4000-8000-000000000001',
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
      displayCarbsText(result.totalCarbsG),
      doseText(result.doseUnits),
      doseLine(result.totalCarbsG, 12.5, result.doseUnits),
      ratioText(12.5),
    )
    expectPlain(texts)
  })

  it('the history', () => {
    const meal = {
      id: '00000000-0000-4000-8000-000000000001',
      eaten_at: '2026-11-14T16:05:00.000Z',
      total_carbs_g: 128.2,
      calculated_dose_units: 8.55,
      applied_dose_units: null,
      meal_items: [{ position: 0, food_name: 'Arroz de prueba' }],
    }
    const now = new Date('2026-11-16T13:00:00Z')
    expectPlain([
      appliedDoseText(null),
      appliedDoseText(8.5),
      mealSummaryText(meal),
      daySummaryText({ day: '2026-11-14', meals: [meal], complete: true }),
      daySummaryText({
        day: '2026-11-14',
        meals: [meal, meal],
        complete: true,
      }),
      ...['2026-11-16', '2026-11-15', '2026-11-14', '2025-11-14'].map((day) =>
        formatDayTitle(day, now),
      ),
    ])
  })

  it('the settings labels and their ⓘ', () => {
    expectPlain([
      RATIO_PHRASE_START,
      RATIO_LABEL_REST,
      RATIO_PHRASE_END,
      ...ALERT_FIELDS.flatMap(({ label, info }) => [label, info]),
    ])
  })

  it('the texts of the ratio', () => {
    const change = ratioChangeTexts(15, 12)
    expectPlain([
      ratioExampleText(15),
      ratioExampleText(60),
      change.question,
      change.detail,
      ratioChangeTexts(15, 15.0001).detail,
      ratioSavedText(12),
    ])
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
    NAME_REQUIRED: true,
    STATE_REQUIRED: true,
    UNIT_WEIGHT_REQUIRED: true,
    FACTOR_NOT_COMPUTABLE: true,
    CARBS_EXCEED_PORTION: true,
    FIBER_EXCEEDS_CARBS: true,
    COLUMN_REQUIRED: true,
    BASIS_REQUIRED: true,
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
  const visionCodes: Record<errors.VisionErrorCode, true> = {
    VISION_QUOTA_EXCEEDED: true,
    DAILY_CAP_REACHED: true,
    VISION_UNAVAILABLE: true,
    VISION_BAD_RESPONSE: true,
    INVALID_REQUEST: true,
  }
  const warningCodes: Record<errors.MealSaveWarning['code'], true> = {
    ITEM_GRAMS_ABOVE_THRESHOLD: true,
    COOKING_FACTOR_UNUSUAL: true,
    DOSE_ABOVE_THRESHOLD: true,
  }

  it('food field errors', () => {
    const codes = Object.keys(foodFieldCodes) as errors.FoodFieldError[]
    expectPlain(codes.map((code) => errors.foodFieldErrorMessage(code)))
  })

  it('meal item errors', () => {
    const codes = Object.keys(itemCodes) as errors.MealItemFoodError[]
    expectPlain(codes.map(errors.mealItemErrorMessage))
  })

  it('label reading errors', () => {
    const codes = Object.keys(visionCodes) as errors.VisionErrorCode[]
    expect([...errors.VISION_ERROR_CODES].sort()).toEqual([...codes].sort())
    expectPlain(codes.map(errors.visionErrorMessage))
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
