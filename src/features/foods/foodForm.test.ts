import { describe, expect, it } from 'vitest'
import {
  carbsLabel,
  hasMoreOptionsErrors,
  initialFoodFormTexts,
  needsFactorConfirmation,
  startsWithMoreOptionsOpen,
  toNewFood,
  unitLine,
  unusualYieldText,
  validateFoodForm,
  yieldLine,
  type FoodFormErrors,
  type FoodFormTexts,
} from './foodForm.ts'
import type { Food } from '../../lib/foods.ts'
import type { FoodFormValues } from './types.ts'

// Invented data, not real foods.

const emptyTexts = initialFoodFormTexts()

/** A valid as_eaten food, with whatever the test overrides. */
function texts(overrides: Partial<FoodFormTexts> = {}): FoodFormTexts {
  return {
    ...emptyTexts,
    name: 'Galletitas de prueba',
    state: 'as_eaten',
    carbsPer100g: '68,4',
    notes: 'Inventado para el test',
    ...overrides,
  }
}

function rawCookedTexts(overrides: Partial<FoodFormTexts> = {}) {
  return texts({ name: 'Fideos de prueba', state: 'raw_cooked', ...overrides })
}

const savedFood: Food = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Galletitas de prueba',
  brand: 'Marca Inventada',
  source: 'label',
  state: 'as_eaten',
  carbs_per_100g: 0.1 + 0.2,
  cooking_factor: null,
  unit_weight_g: 9.5,
  unit_label: 'galletita',
  reference_db: null,
  reference_code: null,
  reference_description: null,
  notes: null,
  photo_path: null,
  archived_at: null,
}

/** A raw_cooked food with a saved factor and nothing in "Más opciones". */
const rawCookedFood: Food = {
  ...savedFood,
  name: 'Arroz de prueba',
  brand: null,
  state: 'raw_cooked',
  carbs_per_100g: 78,
  cooking_factor: 2.6,
  unit_weight_g: null,
  unit_label: null,
}

const values: FoodFormValues = {
  name: 'Galletitas de prueba',
  brand: null,
  state: 'as_eaten',
  carbs_per_100g: 68.4,
  cooking_factor: null,
  unit_weight_g: null,
  unit_label: null,
  notes: 'Inventado para el test',
}

describe('initialFoodFormTexts', () => {
  it('without a food, everything is empty and there is no state', () => {
    expect(initialFoodFormTexts()).toEqual({
      name: '',
      brand: '',
      state: null,
      carbsPer100g: '',
      rawWeight: '',
      cookedWeight: '',
      unitWeight: '',
      unitLabel: '',
      notes: '',
    })
  })

  it('with a food, numbers start without binary noise (§14 #53)', () => {
    const initial = initialFoodFormTexts(savedFood)
    expect(initial.carbsPer100g).toBe('0,3')
    expect(initial.unitWeight).toBe('9,5')
    expect(initial.unitLabel).toBe('galletita')
    expect(initial.brand).toBe('Marca Inventada')
    expect(initial.state).toBe('as_eaten')

    // Saving without touching the field saves the exact saved value.
    const result = validateFoodForm(
      initial,
      savedFood.cooking_factor,
      savedFood,
    )
    expect(result.values?.carbs_per_100g).toBe(0.1 + 0.2)
    expect(result.values?.unit_weight_g).toBe(9.5)
  })

  const tableCopy: Food = {
    ...savedFood,
    name: 'Arroz blanco hervido',
    brand: null,
    source: 'reference',
    reference_db: 'usda_fdc',
    reference_code: '000000',
    reference_description: 'Invented description',
    carbs_per_100g: 28.17 - 0.4,
    unit_weight_g: 12.76 - 1.3,
  }

  it('a copy of the table shows its carbs without binary noise', () => {
    const initial = initialFoodFormTexts(tableCopy)
    expect(initial.carbsPer100g).toBe('27,77')
    expect(initial.unitWeight).toBe('11,46')
  })

  it('saving without touching the field saves the exact value (§14 #53)', () => {
    const initial = initialFoodFormTexts(tableCopy)
    expect(initial.carbsPer100g).toBe('27,77')
    const result = validateFoodForm(initial, null, tableCopy)
    expect(result.values?.carbs_per_100g).toBe(27.770000000000003)
    expect(result.values?.unit_weight_g).toBe(11.459999999999999)
  })

  it('a field the user changed saves what was typed', () => {
    const initial = initialFoodFormTexts(tableCopy)
    const result = validateFoodForm(
      { ...initial, carbsPer100g: '27,8', unitWeight: '11,5' },
      null,
      tableCopy,
    )
    expect(result.values?.carbs_per_100g).toBe(27.8)
    expect(result.values?.unit_weight_g).toBe(11.5)
  })

  it('typing back the same text it started with saves the exact value', () => {
    const initial = initialFoodFormTexts(tableCopy)
    const result = validateFoodForm(
      { ...initial, carbsPer100g: '27,77' },
      null,
      tableCopy,
    )
    expect(result.values?.carbs_per_100g).toBe(27.770000000000003)
  })

  it('a value with few decimals starts as it is', () => {
    const initial = initialFoodFormTexts({
      ...savedFood,
      carbs_per_100g: 12.345,
      unit_weight_g: 100,
    })
    expect(initial.carbsPer100g).toBe('12,345')
    expect(initial.unitWeight).toBe('100')
  })

  it('nulls become empty texts', () => {
    const initial = initialFoodFormTexts({
      ...savedFood,
      brand: null,
      unit_weight_g: null,
      unit_label: null,
    })
    expect(initial.brand).toBe('')
    expect(initial.unitWeight).toBe('')
    expect(initial.unitLabel).toBe('')
    expect(initial.notes).toBe('')
  })

  it('a food with a factor starts with empty weights', () => {
    const initial = initialFoodFormTexts(rawCookedFood)
    expect(initial.rawWeight).toBe('')
    expect(initial.cookedWeight).toBe('')
  })

  it('has no mode, typed factor or reference fields', () => {
    const initial = initialFoodFormTexts({
      ...rawCookedFood,
      source: 'reference',
      reference_db: 'argenfoods',
      reference_code: 'X-123',
      reference_description: 'Descripción inventada',
      notes: 'Nota inventada',
    })
    expect(Object.keys(initial).sort()).toEqual(
      [
        'brand',
        'carbsPer100g',
        'cookedWeight',
        'name',
        'notes',
        'rawWeight',
        'state',
        'unitLabel',
        'unitWeight',
      ].sort(),
    )
    expect(initial.notes).toBe('Nota inventada')
  })
})

describe('validateFoodForm, basics', () => {
  it('a valid form gives the values to save', () => {
    expect(validateFoodForm(texts(), null)).toEqual({ values, errors: {} })
  })

  it.each(['', '   ', ' '])('name %j is NAME_REQUIRED', (name) => {
    const result = validateFoodForm(texts({ name }), null)
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ name: 'NAME_REQUIRED' })
  })

  it('trims name, brand and note', () => {
    const result = validateFoodForm(
      texts({ name: '  Galletitas  ', brand: ' Marca ', notes: ' Nota ' }),
      null,
    )
    expect(result.values).toMatchObject({
      name: 'Galletitas',
      brand: 'Marca',
      notes: 'Nota',
    })
  })

  it('keeps the spaces inside the name', () => {
    const result = validateFoodForm(
      texts({ name: '  Pan  de   prueba ' }),
      null,
    )
    expect(result.values?.name).toBe('Pan  de   prueba')
  })

  it('an empty brand is null', () => {
    const result = validateFoodForm(texts({ brand: '   ' }), null)
    expect(result.values?.brand).toBeNull()
  })
})

describe('validateFoodForm, note (optional, spec §14 #49)', () => {
  it.each(['', '  ', '\n\t '])(
    'an empty note %j is null, no error',
    (notes) => {
      const result = validateFoodForm(texts({ notes }), null)
      expect(result.errors).toEqual({})
      expect(result.values?.notes).toBeNull()
    },
  )

  it('a note is saved trimmed', () => {
    const result = validateFoodForm(texts({ notes: '  Del nutri  ' }), null)
    expect(result.values?.notes).toBe('Del nutri')
  })

  it('a multiline note keeps its inner line breaks', () => {
    const result = validateFoodForm(
      texts({ notes: ' Línea 1\nLínea 2 ' }),
      null,
    )
    expect(result.values?.notes).toBe('Línea 1\nLínea 2')
  })
})

describe('validateFoodForm, no reference fields', () => {
  it('the values never have reference_code or reference_description', () => {
    const result = validateFoodForm(texts(), null)
    expect(result.values).toEqual(values)
    expect(result.values).not.toHaveProperty('reference_code')
    expect(result.values).not.toHaveProperty('reference_description')
  })

  it('an edited reference food gives only the editable columns', () => {
    const food: Food = {
      ...savedFood,
      source: 'reference',
      reference_db: 'argenfoods',
      reference_code: 'X-123',
      reference_description: 'Descripción inventada',
      notes: null,
      brand: null,
      unit_weight_g: null,
      unit_label: null,
    }
    const result = validateFoodForm(
      initialFoodFormTexts(food),
      food.cooking_factor,
    )
    expect(result.errors).toEqual({})
    expect(result.values).toEqual({
      name: food.name,
      brand: null,
      state: food.state,
      // 0.1 + 0.2, normalized when the field starts (§14 #53).
      carbs_per_100g: 0.3,
      cooking_factor: null,
      unit_weight_g: null,
      unit_label: null,
      notes: null,
    })
  })
})

describe('validateFoodForm, state', () => {
  it('without a state is STATE_REQUIRED, and weights and unit are not checked', () => {
    const result = validateFoodForm(
      texts({
        state: null,
        unitWeight: '0',
        unitLabel: 'alfajor',
        rawWeight: '0',
        cookedWeight: 'x',
      }),
      2.6,
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ state: 'STATE_REQUIRED' })
  })

  it('without a state and with other errors, reports them all', () => {
    const result = validateFoodForm(
      texts({ state: null, name: '', carbsPer100g: '101' }),
      null,
    )
    expect(result.errors).toEqual({
      name: 'NAME_REQUIRED',
      state: 'STATE_REQUIRED',
      carbsPer100g: 'ABOVE_100',
    })
  })
})

describe('validateFoodForm, carbs per 100 g', () => {
  it.each([
    ['', 'REQUIRED'],
    ['12.5', 'INVALID_NUMBER'],
    ['100,5', 'ABOVE_100'],
  ] as const)('%j → %s', (carbsPer100g, error) => {
    const result = validateFoodForm(texts({ carbsPer100g }), null)
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ carbsPer100g: error })
  })

  it('0 is valid', () => {
    const result = validateFoodForm(texts({ carbsPer100g: '0' }), null)
    expect(result.values?.carbs_per_100g).toBe(0)
  })

  it('100 is valid', () => {
    const result = validateFoodForm(texts({ carbsPer100g: '100' }), null)
    expect(result.values?.carbs_per_100g).toBe(100)
  })
})

describe('validateFoodForm, cooking factor (raw_cooked)', () => {
  const weights = (rawWeight: string, cookedWeight: string) =>
    rawCookedTexts({ rawWeight, cookedWeight })

  it('empty weights without a saved factor are null (loaded later)', () => {
    const result = validateFoodForm(weights('', ''), null)
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBeNull()
  })

  it('empty weights keep the saved factor', () => {
    const result = validateFoodForm(weights('', ''), 2.6)
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBe(2.6)
  })

  it('an unexact saved factor is kept exactly', () => {
    const result = validateFoodForm(
      initialFoodFormTexts({ ...rawCookedFood, cooking_factor: 10 / 3 }),
      10 / 3,
    )
    expect(result.values?.cooking_factor).toBe(10 / 3)
  })

  it('weights with only spaces count as empty', () => {
    const result = validateFoodForm(weights('   ', ' \t'), 2.6)
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBe(2.6)
  })

  it('a saved factor of 0,9 untouched still asks for confirmation', () => {
    const result = validateFoodForm(
      initialFoodFormTexts({ ...rawCookedFood, cooking_factor: 0.9 }),
      0.9,
    )
    expect(result.values?.cooking_factor).toBe(0.9)
    expect(result.values).not.toBeNull()
    if (result.values !== null) {
      expect(needsFactorConfirmation(result.values)).toBe(true)
    }
  })

  it.each([null, 2.6])(
    'only the raw weight → the cooked one is REQUIRED (saved %s)',
    (saved) => {
      const result = validateFoodForm(weights('100', ''), saved)
      expect(result.values).toBeNull()
      expect(result.errors).toEqual({ cookedWeight: 'REQUIRED' })
    },
  )

  it.each([null, 2.6])(
    'only the cooked weight → the raw one is REQUIRED (saved %s)',
    (saved) => {
      const result = validateFoodForm(weights('', '260'), saved)
      expect(result.values).toBeNull()
      expect(result.errors).toEqual({ rawWeight: 'REQUIRED' })
    },
  )

  it('a weight with only spaces and the other typed → that one is REQUIRED', () => {
    const result = validateFoodForm(weights('100', '   '), 2.6)
    expect(result.errors).toEqual({ cookedWeight: 'REQUIRED' })
  })

  it('a weight of 0 is NOT_POSITIVE', () => {
    const result = validateFoodForm(weights('0', '260'), null)
    expect(result.errors).toEqual({ rawWeight: 'NOT_POSITIVE' })
  })

  it('both weights invalid report both', () => {
    const result = validateFoodForm(weights('1,', '0'), null)
    expect(result.errors).toEqual({
      rawWeight: 'INVALID_NUMBER',
      cookedWeight: 'NOT_POSITIVE',
    })
  })

  it('two valid weights replace the saved factor', () => {
    const result = validateFoodForm(weights('100', '300'), 2.6)
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBe(3)
  })

  it.each([
    ['100', '260', 2.6],
    ['3', '10', 10 / 3],
    ['100', '90', 0.9],
    ['200', '150', 0.75],
    ['1.000', '2.600,5', 2600.5 / 1000],
  ])('%s raw, %s cooked → %s, not rounded', (raw, cooked, factor) => {
    const result = validateFoodForm(weights(raw, cooked), null)
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBe(factor)
  })

  it('an overflowing quotient is FACTOR_NOT_COMPUTABLE', () => {
    const tiny = `0,${'0'.repeat(300)}1`
    const huge = '9'.repeat(300)
    const result = validateFoodForm(weights(tiny, huge), 2.6)
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ measuredFactor: 'FACTOR_NOT_COMPUTABLE' })
  })

  it('an underflowing quotient is FACTOR_NOT_COMPUTABLE', () => {
    const tiny = `0,${'0'.repeat(300)}1`
    const huge = '9'.repeat(300)
    const result = validateFoodForm(weights(huge, tiny), null)
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ measuredFactor: 'FACTOR_NOT_COMPUTABLE' })
  })

  it('a factor whose yield overflows is FACTOR_NOT_COMPUTABLE', () => {
    // 1e307 is finite, but 100 g raw would yield 1e309 g: not showable.
    const result = validateFoodForm(weights('1', `1${'0'.repeat(307)}`), null)
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ measuredFactor: 'FACTOR_NOT_COMPUTABLE' })
  })

  it('a measured factor of exactly 1 or 4 does not ask for confirmation', () => {
    for (const [raw, cooked] of [
      ['100', '100'],
      ['100', '400'],
    ] as const) {
      const result = validateFoodForm(weights(raw, cooked), null)
      expect(result.values).not.toBeNull()
      if (result.values !== null) {
        expect(needsFactorConfirmation(result.values)).toBe(false)
      }
    }
  })

  it('a measured factor below 1 asks for confirmation', () => {
    const result = validateFoodForm(weights('100', '90'), null)
    expect(result.values).not.toBeNull()
    if (result.values !== null) {
      expect(needsFactorConfirmation(result.values)).toBe(true)
    }
  })

  it('with a saved factor, an invalid weight and an empty one report both', () => {
    const result = validateFoodForm(weights('0', ''), 2.6)
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({
      rawWeight: 'NOT_POSITIVE',
      cookedWeight: 'REQUIRED',
    })
  })

  it('with a saved factor, a weight with only a comma is not "empty"', () => {
    const result = validateFoodForm(weights(',', ''), 2.6)
    expect(result.values).toBeNull()
    expect(result.errors.rawWeight).toBe('INVALID_NUMBER')
    expect(result.errors.cookedWeight).toBe('REQUIRED')
  })

  it('an unusual saved factor replaced by usual weights does not ask', () => {
    const result = validateFoodForm(weights('100', '250'), 0.9)
    expect(result.values?.cooking_factor).toBe(2.5)
    expect(result.values).not.toBeNull()
    if (result.values !== null) {
      expect(needsFactorConfirmation(result.values)).toBe(false)
    }
  })

  it('a usual saved factor replaced by unusual weights asks', () => {
    const result = validateFoodForm(weights('100', '450'), 2.6)
    expect(result.values?.cooking_factor).toBe(4.5)
    expect(result.values).not.toBeNull()
    if (result.values !== null) {
      expect(needsFactorConfirmation(result.values)).toBe(true)
    }
  })

  it('weights with thousands separators replace the saved factor', () => {
    const result = validateFoodForm(weights('1.000', '2.500'), 2.6)
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBe(2.5)
  })

  it('weights equal to the saved factor save the same number', () => {
    const result = validateFoodForm(weights('100', '260'), 2.6)
    expect(result.values?.cooking_factor).toBe(2.6)
  })

  it('a saved factor does not hide an error elsewhere', () => {
    const result = validateFoodForm(
      rawCookedTexts({ name: ' ', carbsPer100g: '' }),
      2.6,
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({
      name: 'NAME_REQUIRED',
      carbsPer100g: 'REQUIRED',
    })
  })

  it('without a state, a saved factor is not used and nothing is saved', () => {
    const result = validateFoodForm(
      rawCookedTexts({ state: null, rawWeight: '100', cookedWeight: '' }),
      2.6,
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ state: 'STATE_REQUIRED' })
  })

  it('raw_cooked saves the unit as null and does not check it', () => {
    const result = validateFoodForm(
      rawCookedTexts({ unitWeight: '0', unitLabel: 'paquete' }),
      null,
    )
    expect(result.errors).toEqual({})
    expect(result.values?.unit_weight_g).toBeNull()
    expect(result.values?.unit_label).toBeNull()
  })
})

describe('validateFoodForm, as_eaten', () => {
  it('ignores the weights and the saved factor, and saves null', () => {
    const result = validateFoodForm(
      texts({ rawWeight: '0', cookedWeight: 'x' }),
      2.6,
    )
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBeNull()
  })

  it('a half-typed weight and a saved factor give no error and null', () => {
    const result = validateFoodForm(
      texts({ rawWeight: '100', cookedWeight: '' }),
      2.6,
    )
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBeNull()
  })

  it('with valid weights typed, still null', () => {
    const result = validateFoodForm(
      texts({ rawWeight: '100', cookedWeight: '260' }),
      2.6,
    )
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBeNull()
  })
})

describe('validateFoodForm, changing the state', () => {
  it('raw_cooked → as_eaten → raw_cooked keeps the saved factor', () => {
    const initial = initialFoodFormTexts(rawCookedFood)
    const asEaten = validateFoodForm(
      { ...initial, state: 'as_eaten' },
      rawCookedFood.cooking_factor,
    )
    expect(asEaten.values?.cooking_factor).toBeNull()
    const back = validateFoodForm(
      { ...initial, state: 'raw_cooked' },
      rawCookedFood.cooking_factor,
    )
    expect(back.values?.cooking_factor).toBe(2.6)
  })

  it('as_eaten → raw_cooked drops a saved unit', () => {
    const initial = initialFoodFormTexts(savedFood)
    const result = validateFoodForm(
      { ...initial, state: 'raw_cooked' },
      savedFood.cooking_factor,
    )
    expect(result.values?.unit_weight_g).toBeNull()
    expect(result.values?.unit_label).toBeNull()
    expect(result.values?.cooking_factor).toBeNull()
  })
})

describe('validateFoodForm, unit', () => {
  it('both empty are null', () => {
    const result = validateFoodForm(texts({ unitLabel: '  ' }), null)
    expect(result.errors).toEqual({})
    expect(result.values?.unit_weight_g).toBeNull()
    expect(result.values?.unit_label).toBeNull()
  })

  it('weight and trimmed name', () => {
    const result = validateFoodForm(
      texts({ unitWeight: '45', unitLabel: ' alfajor ' }),
      null,
    )
    expect(result.values?.unit_weight_g).toBe(45)
    expect(result.values?.unit_label).toBe('alfajor')
  })

  it('a weight without a name saves the label as null', () => {
    const result = validateFoodForm(texts({ unitWeight: '9,5' }), null)
    expect(result.values?.unit_weight_g).toBe(9.5)
    expect(result.values?.unit_label).toBeNull()
  })

  it('a name without a weight is UNIT_WEIGHT_REQUIRED', () => {
    const result = validateFoodForm(texts({ unitLabel: 'alfajor' }), null)
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ unitWeight: 'UNIT_WEIGHT_REQUIRED' })
  })

  it('a unit weight with only spaces and a name is UNIT_WEIGHT_REQUIRED', () => {
    const result = validateFoodForm(
      texts({ unitWeight: '   ', unitLabel: 'alfajor' }),
      null,
    )
    expect(result.errors).toEqual({ unitWeight: 'UNIT_WEIGHT_REQUIRED' })
  })

  it('an invalid unit weight does not also report the name', () => {
    const result = validateFoodForm(
      texts({ unitWeight: 'x', unitLabel: '' }),
      null,
    )
    expect(result.errors).toEqual({ unitWeight: 'INVALID_NUMBER' })
  })

  it.each([
    ['0', 'NOT_POSITIVE'],
    ['4,', 'INVALID_NUMBER'],
  ] as const)('weight %j → %s', (unitWeight, error) => {
    const result = validateFoodForm(
      texts({ unitWeight, unitLabel: 'alfajor' }),
      null,
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ unitWeight: error })
  })
})

describe('validateFoodForm, several errors', () => {
  it('reports every field at once, without the note', () => {
    const result = validateFoodForm(
      rawCookedTexts({
        name: '',
        notes: '',
        carbsPer100g: '',
        rawWeight: '0',
        cookedWeight: '',
      }),
      null,
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({
      name: 'NAME_REQUIRED',
      carbsPer100g: 'REQUIRED',
      rawWeight: 'NOT_POSITIVE',
      cookedWeight: 'REQUIRED',
    })
  })
})

describe('validateFoodForm, immutability', () => {
  it('does not change the texts it receives', () => {
    const input = Object.freeze(
      rawCookedTexts({ rawWeight: '100', cookedWeight: '260' }),
    )
    const copy = { ...input }
    expect(() => validateFoodForm(input, 2.6)).not.toThrow()
    expect(input).toEqual(copy)
  })
})

describe('yieldLine', () => {
  it.each([
    ['180', '470', 'Con estos pesos, 100 g crudo rinden 261,1 g cocido.'],
    ['100', '260', 'Con estos pesos, 100 g crudo rinden 260 g cocido.'],
    ['100', '100', 'Con estos pesos, 100 g crudo rinden 100 g cocido.'],
    ['100', '400', 'Con estos pesos, 100 g crudo rinden 400 g cocido.'],
    ['100', '262,5', 'Con estos pesos, 100 g crudo rinden 262,5 g cocido.'],
    ['3', '10', 'Con estos pesos, 100 g crudo rinden 333,3 g cocido.'],
    ['200', '150', 'Con estos pesos, 100 g crudo rinden 75 g cocido.'],
    [' 100 ', ' 260 ', 'Con estos pesos, 100 g crudo rinden 260 g cocido.'],
    ['1.000', '2.600', 'Con estos pesos, 100 g crudo rinden 260 g cocido.'],
    ['100', '100,45', 'Con estos pesos, 100 g crudo rinden 100,5 g cocido.'],
    ['100', '90', 'Con estos pesos, 100 g crudo rinden 90 g cocido.'],
    ['50', '50', 'Con estos pesos, 100 g crudo rinden 100 g cocido.'],
  ])('%j raw, %j cooked → %j', (rawWeight, cookedWeight, line) => {
    expect(yieldLine({ rawWeight, cookedWeight })).toBe(line)
  })

  it.each([
    ['', ''],
    ['', '260'],
    ['100', ''],
    ['   ', '260'],
    ['0', '260'],
    ['100', '0'],
    ['100', '2,'],
    ['abc', '260'],
    ['-100', '260'],
    ['100.5', '260'],
    // The quotient overflows or underflows: not computable.
    [`0,${'0'.repeat(300)}1`, '9'.repeat(300)],
    ['9'.repeat(300), `0,${'0'.repeat(300)}1`],
    // The yield overflows.
    ['1', `1${'0'.repeat(307)}`],
  ])('%j raw, %j cooked → null', (rawWeight, cookedWeight) => {
    expect(yieldLine({ rawWeight, cookedWeight })).toBeNull()
  })

  it('agrees with the factor that validateFoodForm saves', () => {
    const input = rawCookedTexts({ rawWeight: '3', cookedWeight: '10' })
    expect(validateFoodForm(input, null).values?.cooking_factor).toBe(10 / 3)
    expect(yieldLine(input)).toBe(
      'Con estos pesos, 100 g crudo rinden 333,3 g cocido.',
    )
  })

  it('does not change the texts it receives', () => {
    const input = Object.freeze(
      texts({ rawWeight: '100', cookedWeight: '260' }),
    )
    expect(yieldLine(input)).toBe(
      'Con estos pesos, 100 g crudo rinden 260 g cocido.',
    )
  })
})

describe('unusualYieldText', () => {
  it('says how much 100 g raw yield, formatted', () => {
    expect(unusualYieldText(0.9)).toBe(
      'Con estos datos, 100 g crudo rinden 90 g cocido, y lo habitual es entre 100 y 400 g. Puede ser un error de tipeo. ¿Lo guardás igual?',
    )
    expect(unusualYieldText(4.0001)).toContain('rinden 400 g cocido')
    expect(unusualYieldText(0.12345)).toContain('rinden 12,3 g cocido')
  })

  it.each([0, -1, NaN, Infinity])('%s → null', (factor) => {
    expect(unusualYieldText(factor)).toBeNull()
  })
})

describe('carbsLabel', () => {
  it.each([
    [null, 'HC cada 100 g'],
    ['as_eaten', 'HC cada 100 g'],
    ['raw_cooked', 'HC cada 100 g, en crudo'],
  ] as const)('%s → %j', (state, label) => {
    expect(carbsLabel(state)).toBe(label)
  })
})

describe('startsWithMoreOptionsOpen', () => {
  const plain: Food = {
    ...savedFood,
    brand: null,
    unit_weight_g: null,
    unit_label: null,
    notes: null,
  }

  it('a new food starts closed', () => {
    expect(startsWithMoreOptionsOpen()).toBe(false)
  })

  it('an as_eaten food with nothing inside starts closed', () => {
    expect(startsWithMoreOptionsOpen(plain)).toBe(false)
  })

  it.each<[string, Partial<Food>]>([
    ['a brand', { brand: 'Marca' }],
    ['a unit weight', { unit_weight_g: 45 }],
    ['only a unit name', { unit_label: 'alfajor' }],
    ['a note', { notes: 'Nota' }],
    ['raw_cooked with a factor', { state: 'raw_cooked', cooking_factor: 2.6 }],
    ['raw_cooked without a factor', { state: 'raw_cooked' }],
  ])('with %s starts open', (_, overrides) => {
    expect(startsWithMoreOptionsOpen({ ...plain, ...overrides })).toBe(true)
  })

  it('a label food with nothing inside starts closed', () => {
    expect(startsWithMoreOptionsOpen({ ...plain, source: 'label' })).toBe(false)
  })

  it('an archived food with a note starts open', () => {
    expect(
      startsWithMoreOptionsOpen({
        ...plain,
        notes: 'Nota',
        archived_at: '2026-11-13T12:00:00+00:00',
      }),
    ).toBe(true)
  })

  it('a cooked reference food starts open (how much it yields is inside)', () => {
    expect(
      startsWithMoreOptionsOpen({
        ...plain,
        source: 'reference',
        reference_db: 'argenfoods',
        reference_code: 'X-123',
        state: 'raw_cooked',
        cooking_factor: 2.6,
      }),
    ).toBe(true)
  })

  it('agrees with the texts the edit form starts with', () => {
    // Whatever starts open has something to show inside.
    for (const food of [plain, savedFood, rawCookedFood]) {
      const start = initialFoodFormTexts(food)
      const hasSomething =
        start.brand !== '' ||
        start.unitWeight !== '' ||
        start.unitLabel !== '' ||
        start.notes !== '' ||
        start.state === 'raw_cooked'
      expect(startsWithMoreOptionsOpen(food)).toBe(hasSomething)
    }
  })

  it('a reference food with a code and nothing else starts closed', () => {
    expect(
      startsWithMoreOptionsOpen({
        ...plain,
        source: 'reference',
        reference_db: 'argenfoods',
        reference_code: 'X-123',
        reference_description: 'Descripción inventada',
      }),
    ).toBe(false)
  })
})

describe('hasMoreOptionsErrors', () => {
  it.each<FoodFormErrors>([
    { unitWeight: 'UNIT_WEIGHT_REQUIRED' },
    { rawWeight: 'REQUIRED' },
    { cookedWeight: 'NOT_POSITIVE' },
    { measuredFactor: 'FACTOR_NOT_COMPUTABLE' },
    { name: 'NAME_REQUIRED', rawWeight: 'REQUIRED' },
    { carbsPer100g: 'ABOVE_100', unitWeight: 'NOT_POSITIVE' },
  ])('%o → true', (errors) => {
    expect(hasMoreOptionsErrors(errors)).toBe(true)
  })

  it.each<FoodFormErrors>([
    {},
    { name: 'NAME_REQUIRED' },
    { carbsPer100g: 'ABOVE_100' },
    { state: 'STATE_REQUIRED' },
  ])('%o → false', (errors) => {
    expect(hasMoreOptionsErrors(errors)).toBe(false)
  })

  it('agrees with validateFoodForm: a missing cooked weight opens it', () => {
    const result = validateFoodForm(
      rawCookedTexts({ rawWeight: '100', cookedWeight: '' }),
      null,
    )
    expect(hasMoreOptionsErrors(result.errors)).toBe(true)
  })

  it('agrees with validateFoodForm: a unit name without weight opens it', () => {
    const result = validateFoodForm(texts({ unitLabel: 'alfajor' }), null)
    expect(hasMoreOptionsErrors(result.errors)).toBe(true)
  })

  it('agrees with validateFoodForm: errors only at sight do not open it', () => {
    const result = validateFoodForm(
      { ...emptyTexts, carbsPer100g: '101' },
      null,
    )
    expect(Object.keys(result.errors).sort()).toEqual(
      ['carbsPer100g', 'name', 'state'].sort(),
    )
    expect(hasMoreOptionsErrors(result.errors)).toBe(false)
  })
})

describe('unitLine', () => {
  it('shows the unit name and its weight', () => {
    expect(unitLine(texts({ unitWeight: '45', unitLabel: 'alfajor' }))).toBe(
      '1 alfajor = 45 g',
    )
  })

  it('says "unidad" without a name', () => {
    expect(unitLine(texts({ unitWeight: '45', unitLabel: '  ' }))).toBe(
      '1 unidad = 45 g',
    )
  })

  it('trims the name and shows the weight exact', () => {
    expect(
      unitLine(texts({ unitWeight: '12,3456', unitLabel: '  barrita ' })),
    ).toBe('1 barrita = 12,3456 g')
  })

  it('shows a weight with thousands separators', () => {
    expect(unitLine(texts({ unitWeight: '1500', unitLabel: 'paquete' }))).toBe(
      '1 paquete = 1.500 g',
    )
  })

  it('keeps the spaces inside the name', () => {
    expect(
      unitLine(texts({ unitWeight: '45', unitLabel: ' alfajor  de maicena ' })),
    ).toBe('1 alfajor  de maicena = 45 g')
  })

  it('does not change the texts it receives', () => {
    const input = Object.freeze(texts({ unitWeight: '45', unitLabel: 'a' }))
    expect(unitLine(input)).toBe('1 a = 45 g')
  })

  it.each(['', '   ', '0', '0,0', '-1', '4.5', 'abc', '2,'])(
    '%j weight → null',
    (unitWeight) => {
      expect(unitLine(texts({ unitWeight, unitLabel: 'alfajor' }))).toBeNull()
    },
  )
})

describe('needsFactorConfirmation', () => {
  const withFactor = (cooking_factor: number | null): FoodFormValues => ({
    ...values,
    state: 'raw_cooked',
    cooking_factor,
  })

  it.each([0.9999, 4.0001, 0.5, 10])('%s asks for confirmation', (factor) => {
    expect(needsFactorConfirmation(withFactor(factor))).toBe(true)
  })

  it.each([1, 4, 2.6, null])('%s does not', (factor) => {
    expect(needsFactorConfirmation(withFactor(factor))).toBe(false)
  })

  it('an as_eaten food does not (its factor is always null)', () => {
    expect(needsFactorConfirmation(values)).toBe(false)
  })
})

describe('toNewFood', () => {
  it('is always a manual food, without reference columns', () => {
    const row = toNewFood(values)
    expect(row).toEqual({ ...values, source: 'manual' })
    expect(row).not.toHaveProperty('reference_db')
    expect(row).not.toHaveProperty('reference_code')
    expect(row).not.toHaveProperty('reference_description')
  })

  it('does not change the values it receives', () => {
    const input = Object.freeze({ ...values })
    toNewFood(input)
    expect(input).toEqual(values)
  })
})
