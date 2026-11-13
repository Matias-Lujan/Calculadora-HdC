import { describe, expect, it } from 'vitest'
import {
  carbsLabel,
  initialFoodFormTexts,
  measuredFactorLine,
  needsFactorConfirmation,
  newFoodReferenceDb,
  referenceCodeLabel,
  sourceText,
  toNewFood,
  unitLine,
  validateFoodForm,
  type FoodFormTexts,
} from './foodForm.ts'
import type { Food, FoodFormValues } from './types.ts'

// Invented data, not real foods.

const emptyTexts = initialFoodFormTexts()

/** A valid manual as_eaten food, with whatever the test overrides. */
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
  archived_at: null,
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
  reference_code: null,
  reference_description: null,
}

describe('initialFoodFormTexts', () => {
  it('without a food, everything is empty, no state and measured factor', () => {
    expect(initialFoodFormTexts()).toEqual({
      name: '',
      brand: '',
      state: null,
      carbsPer100g: '',
      factorMode: 'measure',
      rawWeight: '',
      cookedWeight: '',
      cookingFactor: '',
      unitWeight: '',
      unitLabel: '',
      notes: '',
      referenceCode: '',
      referenceDescription: '',
    })
  })

  it('with a food, numbers are exact and round-trip', () => {
    const initial = initialFoodFormTexts(savedFood)
    expect(initial.carbsPer100g).toBe('0,30000000000000004')
    expect(initial.unitWeight).toBe('9,5')
    expect(initial.unitLabel).toBe('galletita')
    expect(initial.brand).toBe('Marca Inventada')
    expect(initial.state).toBe('as_eaten')

    const result = validateFoodForm(initial, savedFood.source)
    expect(result.values?.carbs_per_100g).toBe(0.1 + 0.2)
    expect(result.values?.unit_weight_g).toBe(9.5)
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
    expect(initial.referenceCode).toBe('')
    expect(initial.referenceDescription).toBe('')
    expect(initial.cookingFactor).toBe('')
  })

  it('a food with a factor starts in direct mode, with the exact factor', () => {
    const initial = initialFoodFormTexts({
      ...savedFood,
      state: 'raw_cooked',
      cooking_factor: 260 / 100,
      unit_weight_g: null,
      unit_label: null,
    })
    expect(initial.factorMode).toBe('direct')
    expect(initial.cookingFactor).toBe('2,6')
    expect(initial.rawWeight).toBe('')
    expect(initial.cookedWeight).toBe('')
  })

  it('a raw_cooked food without a factor starts in measure mode', () => {
    const initial = initialFoodFormTexts({
      ...savedFood,
      state: 'raw_cooked',
      cooking_factor: null,
    })
    expect(initial.factorMode).toBe('measure')
  })

  it('loads the reference fields', () => {
    const initial = initialFoodFormTexts({
      ...savedFood,
      source: 'reference',
      reference_db: 'argenfoods',
      reference_code: 'X-123',
      reference_description: 'Descripción inventada',
      notes: 'Nota inventada',
    })
    expect(initial.referenceCode).toBe('X-123')
    expect(initial.referenceDescription).toBe('Descripción inventada')
    expect(initial.notes).toBe('Nota inventada')
  })
})

describe('validateFoodForm, manual source', () => {
  it('a valid form gives the values to save', () => {
    expect(validateFoodForm(texts(), 'manual')).toEqual({ values, errors: {} })
  })

  it.each(['', '   ', ' '])('name %j is REQUIRED', (name) => {
    const result = validateFoodForm(texts({ name }), 'manual')
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ name: 'REQUIRED' })
  })

  it.each(['', '  '])('an empty note %j is REQUIRED', (notes) => {
    const result = validateFoodForm(texts({ notes }), 'manual')
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ notes: 'REQUIRED' })
  })

  it('trims name, brand and note', () => {
    const result = validateFoodForm(
      texts({ name: '  Galletitas  ', brand: ' Marca ', notes: ' Nota ' }),
      'manual',
    )
    expect(result.values).toMatchObject({
      name: 'Galletitas',
      brand: 'Marca',
      notes: 'Nota',
    })
  })

  it('an empty brand is null', () => {
    const result = validateFoodForm(texts({ brand: '   ' }), 'manual')
    expect(result.values?.brand).toBeNull()
  })

  it('reference fields are null even if they were typed', () => {
    const result = validateFoodForm(
      texts({ referenceCode: 'X-1', referenceDescription: 'Algo' }),
      'manual',
    )
    expect(result.values?.reference_code).toBeNull()
    expect(result.values?.reference_description).toBeNull()
  })
})

describe('validateFoodForm, reference source', () => {
  const reference = (overrides: Partial<FoodFormTexts> = {}) =>
    texts({ referenceCode: 'X-123', notes: '', ...overrides })

  it('without a code is REQUIRED', () => {
    const result = validateFoodForm(
      reference({ referenceCode: ' ' }),
      'reference',
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ referenceCode: 'REQUIRED' })
  })

  it('an empty note is valid and saved as null', () => {
    const result = validateFoodForm(reference(), 'reference')
    expect(result.errors).toEqual({})
    expect(result.values?.notes).toBeNull()
  })

  it('an empty description is null', () => {
    const result = validateFoodForm(
      reference({ referenceDescription: '  ' }),
      'reference',
    )
    expect(result.values?.reference_description).toBeNull()
  })

  it('code and description are trimmed', () => {
    const result = validateFoodForm(
      reference({ referenceCode: ' X-123 ', referenceDescription: ' Algo ' }),
      'reference',
    )
    expect(result.values?.reference_code).toBe('X-123')
    expect(result.values?.reference_description).toBe('Algo')
  })
})

describe('validateFoodForm, label source', () => {
  it('neither the note nor the code are required', () => {
    const result = validateFoodForm(texts({ notes: '' }), 'label')
    expect(result.errors).toEqual({})
    expect(result.values?.notes).toBeNull()
    expect(result.values?.reference_code).toBeNull()
  })
})

describe('validateFoodForm, state', () => {
  it('without a state is STATE_REQUIRED, and factor and unit are not checked', () => {
    const result = validateFoodForm(
      texts({
        state: null,
        factorMode: 'direct',
        cookingFactor: 'abc',
        unitWeight: '0',
        unitLabel: 'alfajor',
        rawWeight: '0',
      }),
      'manual',
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ state: 'STATE_REQUIRED' })
  })
})

describe('validateFoodForm, carbs per 100 g', () => {
  it.each([
    ['', 'REQUIRED'],
    ['12.5', 'INVALID_NUMBER'],
    ['100,5', 'ABOVE_100'],
  ] as const)('%j → %s', (carbsPer100g, error) => {
    const result = validateFoodForm(texts({ carbsPer100g }), 'manual')
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ carbsPer100g: error })
  })

  it('0 is valid', () => {
    const result = validateFoodForm(texts({ carbsPer100g: '0' }), 'manual')
    expect(result.values?.carbs_per_100g).toBe(0)
  })

  it('100 is valid', () => {
    const result = validateFoodForm(texts({ carbsPer100g: '100' }), 'manual')
    expect(result.values?.carbs_per_100g).toBe(100)
  })
})

describe('validateFoodForm, cooking factor', () => {
  it('as_eaten ignores the factor texts and saves null', () => {
    const result = validateFoodForm(
      texts({
        factorMode: 'direct',
        cookingFactor: 'abc',
        rawWeight: '0',
        cookedWeight: '5',
      }),
      'manual',
    )
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBeNull()
  })

  describe('direct mode', () => {
    const direct = (cookingFactor: string) =>
      rawCookedTexts({ factorMode: 'direct', cookingFactor })

    it.each(['', '  '])('%j is null (loaded later)', (cookingFactor) => {
      const result = validateFoodForm(direct(cookingFactor), 'manual')
      expect(result.errors).toEqual({})
      expect(result.values?.cooking_factor).toBeNull()
    })

    it.each([
      ['0', 'NOT_POSITIVE'],
      ['2,', 'INVALID_NUMBER'],
      ['2.6', 'INVALID_NUMBER'],
      ['-2', 'INVALID_NUMBER'],
    ] as const)('%j → %s', (cookingFactor, error) => {
      const result = validateFoodForm(direct(cookingFactor), 'manual')
      expect(result.values).toBeNull()
      expect(result.errors).toEqual({ cookingFactor: error })
    })

    it.each([
      ['2,6', 2.6],
      ['0,5', 0.5],
      ['10', 10],
    ])('%j → %s', (cookingFactor, factor) => {
      const result = validateFoodForm(direct(cookingFactor), 'manual')
      expect(result.values?.cooking_factor).toBe(factor)
    })
  })

  describe('measure mode', () => {
    const measure = (rawWeight: string, cookedWeight: string) =>
      rawCookedTexts({ factorMode: 'measure', rawWeight, cookedWeight })

    it('both weights empty is null', () => {
      const result = validateFoodForm(measure(' ', ''), 'manual')
      expect(result.errors).toEqual({})
      expect(result.values?.cooking_factor).toBeNull()
    })

    it('only the raw weight → the cooked one is REQUIRED', () => {
      const result = validateFoodForm(measure('100', ''), 'manual')
      expect(result.values).toBeNull()
      expect(result.errors).toEqual({ cookedWeight: 'REQUIRED' })
    })

    it('only the cooked weight → the raw one is REQUIRED', () => {
      const result = validateFoodForm(measure('', '260'), 'manual')
      expect(result.values).toBeNull()
      expect(result.errors).toEqual({ rawWeight: 'REQUIRED' })
    })

    it('a weight of 0 is NOT_POSITIVE', () => {
      const result = validateFoodForm(measure('0', '260'), 'manual')
      expect(result.errors).toEqual({ rawWeight: 'NOT_POSITIVE' })
    })

    it('both weights invalid report both', () => {
      const result = validateFoodForm(measure('1,', '0'), 'manual')
      expect(result.errors).toEqual({
        rawWeight: 'INVALID_NUMBER',
        cookedWeight: 'NOT_POSITIVE',
      })
    })

    it.each([
      ['100', '260', 260 / 100],
      ['3', '10', 10 / 3],
      ['100', '90', 0.9],
      ['1.000', '2.600,5', 2600.5 / 1000],
    ])('%s raw, %s cooked → %s, not rounded', (raw, cooked, factor) => {
      const result = validateFoodForm(measure(raw, cooked), 'manual')
      expect(result.errors).toEqual({})
      expect(result.values?.cooking_factor).toBe(factor)
    })

    it('an overflowing quotient is FACTOR_NOT_COMPUTABLE', () => {
      const tiny = `0,${'0'.repeat(300)}1`
      const huge = '9'.repeat(300)
      const result = validateFoodForm(measure(tiny, huge), 'manual')
      expect(result.values).toBeNull()
      expect(result.errors).toEqual({ measuredFactor: 'FACTOR_NOT_COMPUTABLE' })
    })

    it('an underflowing quotient is FACTOR_NOT_COMPUTABLE', () => {
      const tiny = `0,${'0'.repeat(300)}1`
      const huge = '9'.repeat(300)
      const result = validateFoodForm(measure(huge, tiny), 'manual')
      expect(result.values).toBeNull()
      expect(result.errors).toEqual({ measuredFactor: 'FACTOR_NOT_COMPUTABLE' })
    })
  })

  it('direct mode ignores the weights', () => {
    const result = validateFoodForm(
      rawCookedTexts({
        factorMode: 'direct',
        cookingFactor: '2,6',
        rawWeight: '0',
        cookedWeight: 'x',
      }),
      'manual',
    )
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBe(2.6)
  })

  it('measure mode ignores the typed factor', () => {
    const result = validateFoodForm(
      rawCookedTexts({
        factorMode: 'measure',
        cookingFactor: 'abc',
        rawWeight: '100',
        cookedWeight: '250',
      }),
      'manual',
    )
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBe(2.5)
  })
})

describe('validateFoodForm, unit', () => {
  it('both empty are null', () => {
    const result = validateFoodForm(texts({ unitLabel: '  ' }), 'manual')
    expect(result.errors).toEqual({})
    expect(result.values?.unit_weight_g).toBeNull()
    expect(result.values?.unit_label).toBeNull()
  })

  it('weight and trimmed name', () => {
    const result = validateFoodForm(
      texts({ unitWeight: '45', unitLabel: ' alfajor ' }),
      'manual',
    )
    expect(result.values?.unit_weight_g).toBe(45)
    expect(result.values?.unit_label).toBe('alfajor')
  })

  it('a weight without a name saves the label as null', () => {
    const result = validateFoodForm(texts({ unitWeight: '9,5' }), 'manual')
    expect(result.values?.unit_weight_g).toBe(9.5)
    expect(result.values?.unit_label).toBeNull()
  })

  it('a name without a weight is UNIT_WEIGHT_REQUIRED', () => {
    const result = validateFoodForm(texts({ unitLabel: 'alfajor' }), 'manual')
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ unitWeight: 'UNIT_WEIGHT_REQUIRED' })
  })

  it.each([
    ['0', 'NOT_POSITIVE'],
    ['4,', 'INVALID_NUMBER'],
  ] as const)('weight %j → %s', (unitWeight, error) => {
    const result = validateFoodForm(
      texts({ unitWeight, unitLabel: 'alfajor' }),
      'manual',
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ unitWeight: error })
  })

  it('raw_cooked saves the unit as null and does not check it', () => {
    const result = validateFoodForm(
      rawCookedTexts({ unitWeight: '0', unitLabel: 'paquete' }),
      'manual',
    )
    expect(result.errors).toEqual({})
    expect(result.values?.unit_weight_g).toBeNull()
    expect(result.values?.unit_label).toBeNull()
  })
})

describe('validateFoodForm, several errors', () => {
  it('reports every field at once', () => {
    const result = validateFoodForm(
      rawCookedTexts({
        name: '',
        notes: '',
        carbsPer100g: '',
        factorMode: 'direct',
        cookingFactor: '0',
      }),
      'manual',
    )
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({
      name: 'REQUIRED',
      notes: 'REQUIRED',
      carbsPer100g: 'REQUIRED',
      cookingFactor: 'NOT_POSITIVE',
    })
  })
})

describe('validateFoodForm, immutability', () => {
  it('does not change the texts it receives', () => {
    const input = Object.freeze(
      rawCookedTexts({ rawWeight: '100', cookedWeight: '260' }),
    )
    const copy = { ...input }
    expect(() => validateFoodForm(input, 'manual')).not.toThrow()
    expect(input).toEqual(copy)
  })
})

describe('validateFoodForm, more edge cases', () => {
  it('keeps the spaces inside the name', () => {
    const result = validateFoodForm(
      texts({ name: '  Pan  de   prueba ' }),
      'manual',
    )
    expect(result.values?.name).toBe('Pan  de   prueba')
  })

  it('a reference food saves its typed note, trimmed', () => {
    const result = validateFoodForm(
      texts({ referenceCode: 'X-1', notes: '  Nota  ' }),
      'reference',
    )
    expect(result.errors).toEqual({})
    expect(result.values?.notes).toBe('Nota')
  })

  it('a reference food with a missing code and note only reports the code', () => {
    const result = validateFoodForm(
      texts({ referenceCode: '', notes: '' }),
      'reference',
    )
    expect(result.errors).toEqual({ referenceCode: 'REQUIRED' })
  })

  it('a label food saves the reference fields as null even if typed', () => {
    const result = validateFoodForm(
      texts({ referenceCode: 'X-1', referenceDescription: 'Algo' }),
      'label',
    )
    expect(result.errors).toEqual({})
    expect(result.values?.reference_code).toBeNull()
    expect(result.values?.reference_description).toBeNull()
  })

  it('a unit weight with only spaces and a name is UNIT_WEIGHT_REQUIRED', () => {
    const result = validateFoodForm(
      texts({ unitWeight: '   ', unitLabel: 'alfajor' }),
      'manual',
    )
    expect(result.errors).toEqual({ unitWeight: 'UNIT_WEIGHT_REQUIRED' })
  })

  it('an invalid unit weight does not also report the name', () => {
    const result = validateFoodForm(
      texts({ unitWeight: 'x', unitLabel: '' }),
      'manual',
    )
    expect(result.errors).toEqual({ unitWeight: 'INVALID_NUMBER' })
  })

  it('a direct factor with spaces around is accepted', () => {
    const result = validateFoodForm(
      rawCookedTexts({ factorMode: 'direct', cookingFactor: ' 2,6 ' }),
      'manual',
    )
    expect(result.values?.cooking_factor).toBe(2.6)
  })

  it('measure mode with spaces in one weight → that one is REQUIRED', () => {
    const result = validateFoodForm(
      rawCookedTexts({ rawWeight: '100', cookedWeight: '   ' }),
      'manual',
    )
    expect(result.errors).toEqual({ cookedWeight: 'REQUIRED' })
  })

  it('a cooked weight smaller than the raw one is valid', () => {
    const result = validateFoodForm(
      rawCookedTexts({ rawWeight: '200', cookedWeight: '150' }),
      'manual',
    )
    expect(result.values?.cooking_factor).toBe(0.75)
  })

  it('without a state and with other errors, reports them all', () => {
    const result = validateFoodForm(
      texts({ state: null, name: '', carbsPer100g: '101' }),
      'manual',
    )
    expect(result.errors).toEqual({
      name: 'REQUIRED',
      state: 'STATE_REQUIRED',
      carbsPer100g: 'ABOVE_100',
    })
  })

  it('switching as_eaten → raw_cooked drops a saved unit', () => {
    const initial = initialFoodFormTexts(savedFood)
    const result = validateFoodForm(
      { ...initial, state: 'raw_cooked' },
      savedFood.source,
    )
    expect(result.values?.unit_weight_g).toBeNull()
    expect(result.values?.unit_label).toBeNull()
  })

  it('switching raw_cooked → as_eaten drops a saved factor', () => {
    const initial = initialFoodFormTexts({
      ...savedFood,
      state: 'raw_cooked',
      cooking_factor: 2.6,
      unit_weight_g: null,
      unit_label: null,
    })
    const result = validateFoodForm(
      { ...initial, state: 'as_eaten' },
      savedFood.source,
    )
    expect(result.errors).toEqual({})
    expect(result.values?.cooking_factor).toBeNull()
  })

  it('an edited food with an unexact factor round-trips exactly', () => {
    const food: Food = {
      ...savedFood,
      state: 'raw_cooked',
      cooking_factor: 10 / 3,
      unit_weight_g: null,
      unit_label: null,
    }
    const result = validateFoodForm(initialFoodFormTexts(food), food.source)
    expect(result.values?.cooking_factor).toBe(10 / 3)
  })

  it('an edited reference food round-trips all its fields', () => {
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
    const result = validateFoodForm(initialFoodFormTexts(food), food.source)
    expect(result.errors).toEqual({})
    expect(result.values).toEqual({
      name: food.name,
      brand: null,
      state: food.state,
      carbs_per_100g: food.carbs_per_100g,
      cooking_factor: null,
      unit_weight_g: null,
      unit_label: null,
      notes: null,
      reference_code: 'X-123',
      reference_description: 'Descripción inventada',
    })
  })

  it('a measured factor of exactly 1 or 4 does not ask for confirmation', () => {
    for (const [raw, cooked] of [
      ['100', '100'],
      ['100', '400'],
    ]) {
      const result = validateFoodForm(
        rawCookedTexts({ rawWeight: raw, cookedWeight: cooked }),
        'manual',
      )
      expect(result.values).not.toBeNull()
      if (result.values !== null) {
        expect(needsFactorConfirmation(result.values)).toBe(false)
      }
    }
  })

  it('a measured factor below 1 asks for confirmation', () => {
    const result = validateFoodForm(
      rawCookedTexts({ rawWeight: '100', cookedWeight: '90' }),
      'manual',
    )
    expect(result.values).not.toBeNull()
    if (result.values !== null) {
      expect(needsFactorConfirmation(result.values)).toBe(true)
    }
  })
})

describe('measuredFactorLine', () => {
  it('shows cooked ÷ raw = factor (spec §6.4)', () => {
    expect(
      measuredFactorLine(texts({ rawWeight: '100', cookedWeight: '260' })),
    ).toBe('Factor = 260 ÷ 100 = 2,60')
  })

  it('shows the weights exact and the factor with 2 decimals', () => {
    expect(
      measuredFactorLine(
        texts({ rawWeight: '123,456', cookedWeight: '300,0001' }),
      ),
    ).toBe('Factor = 300,0001 ÷ 123,456 = 2,43')
  })

  it('does not depend on the factor mode', () => {
    expect(
      measuredFactorLine(
        texts({ factorMode: 'direct', rawWeight: '3', cookedWeight: '10' }),
      ),
    ).toBe('Factor = 10 ÷ 3 = 3,33')
  })

  it('also shows a factor outside 1–4 (the confirmation is at saving)', () => {
    expect(
      measuredFactorLine(texts({ rawWeight: '100', cookedWeight: '90' })),
    ).toBe('Factor = 90 ÷ 100 = 0,90')
  })

  it('does not change the texts it receives', () => {
    const input = Object.freeze(
      texts({ rawWeight: '100', cookedWeight: '260' }),
    )
    expect(measuredFactorLine(input)).toBe('Factor = 260 ÷ 100 = 2,60')
  })

  it.each([
    ['', ''],
    ['', '260'],
    ['100', ''],
    ['0', '260'],
    ['100', '0'],
    ['100', '2,'],
    ['abc', '260'],
    // The quotient overflows: not computable.
    [`0,${'0'.repeat(300)}1`, '9'.repeat(300)],
  ])('%j raw, %j cooked → null', (rawWeight, cookedWeight) => {
    expect(measuredFactorLine(texts({ rawWeight, cookedWeight }))).toBeNull()
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

  it('does not change the texts it receives', () => {
    const input = Object.freeze(texts({ unitWeight: '45', unitLabel: 'a' }))
    expect(unitLine(input)).toBe('1 a = 45 g')
  })

  it.each(['', '0', 'abc', '2,'])('%j weight → null', (unitWeight) => {
    expect(unitLine(texts({ unitWeight, unitLabel: 'alfajor' }))).toBeNull()
  })
})

describe('newFoodReferenceDb', () => {
  it('a reference food from the form is ARGENFOODS', () => {
    expect(newFoodReferenceDb('reference')).toBe('argenfoods')
  })

  it('a manual food has none', () => {
    expect(newFoodReferenceDb('manual')).toBeNull()
  })
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
  it('a manual food has no reference base', () => {
    expect(toNewFood('manual', values)).toEqual({
      ...values,
      source: 'manual',
      reference_db: null,
    })
  })

  it('a reference food is from ARGENFOODS', () => {
    const referenceValues = { ...values, reference_code: 'X-123' }
    expect(toNewFood('reference', referenceValues)).toEqual({
      ...referenceValues,
      source: 'reference',
      reference_db: 'argenfoods',
    })
  })

  it('does not change the values it receives', () => {
    const input = Object.freeze({ ...values })
    toNewFood('reference', input)
    expect(input).toEqual(values)
  })
})

describe('measuredFactorLine, edge cases', () => {
  it('accepts weights with spaces around and shows them clean', () => {
    expect(
      measuredFactorLine(texts({ rawWeight: ' 100 ', cookedWeight: ' 260 ' })),
    ).toBe('Factor = 260 ÷ 100 = 2,60')
  })

  it('shows weights with thousands separators', () => {
    expect(
      measuredFactorLine(
        texts({ rawWeight: '1.000', cookedWeight: '2.600,5' }),
      ),
    ).toBe('Factor = 2.600,5 ÷ 1.000 = 2,60')
  })

  it.each([
    ['100', '100', 'Factor = 100 ÷ 100 = 1,00'],
    ['100', '400', 'Factor = 400 ÷ 100 = 4,00'],
    ['100', '262,5', 'Factor = 262,5 ÷ 100 = 2,63'],
    ['200', '401', 'Factor = 401 ÷ 200 = 2,01'],
    ['8', '1', 'Factor = 1 ÷ 8 = 0,13'],
  ])('%s raw, %s cooked → %s (bounds, half up)', (raw, cooked, line) => {
    expect(
      measuredFactorLine(texts({ rawWeight: raw, cookedWeight: cooked })),
    ).toBe(line)
  })

  it.each([
    ['   ', '260'],
    ['100', '   '],
    ['-100', '260'],
    ['100', '-260'],
    ['0,0', '0'],
    ['100.5', '260'],
    // The quotient underflows to 0: not computable.
    ['9'.repeat(300), `0,${'0'.repeat(300)}1`],
  ])('%j raw, %j cooked → null', (rawWeight, cookedWeight) => {
    expect(measuredFactorLine(texts({ rawWeight, cookedWeight }))).toBeNull()
  })

  it('agrees with the factor that validateFoodForm saves', () => {
    const input = rawCookedTexts({ rawWeight: '3', cookedWeight: '10' })
    expect(validateFoodForm(input, 'manual').values?.cooking_factor).toBe(
      10 / 3,
    )
    expect(measuredFactorLine(input)).toBe('Factor = 10 ÷ 3 = 3,33')
  })
})

describe('unitLine, edge cases', () => {
  it('accepts a weight with spaces around', () => {
    expect(unitLine(texts({ unitWeight: ' 45 ', unitLabel: 'alfajor' }))).toBe(
      '1 alfajor = 45 g',
    )
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

  it('an empty name says "unidad"', () => {
    expect(unitLine(texts({ unitWeight: '0,5', unitLabel: '' }))).toBe(
      '1 unidad = 0,5 g',
    )
  })

  it.each(['   ', '0,0', '-1', '4.5'])('%j weight → null', (unitWeight) => {
    expect(unitLine(texts({ unitWeight, unitLabel: 'alfajor' }))).toBeNull()
  })

  it('without a weight it is null, even with a blank name', () => {
    expect(unitLine(texts({ unitWeight: '', unitLabel: '   ' }))).toBeNull()
  })
})

describe('sourceText', () => {
  it.each([
    ['manual', null, 'Manual'],
    ['label', null, 'Etiqueta'],
    ['reference', 'argenfoods', 'Tabla de referencia (ARGENFOODS)'],
    ['reference', 'usda_fdc', 'Tabla de referencia (USDA FoodData Central)'],
    ['reference', null, 'Tabla de referencia'],
  ] as const)('%s + %s → %j', (source, referenceDb, text) => {
    expect(sourceText(source, referenceDb)).toBe(text)
  })
})

describe('referenceCodeLabel', () => {
  it.each([
    ['argenfoods', 'Código ARGENFOODS'],
    ['usda_fdc', 'Código USDA FoodData Central'],
    [null, 'Código de referencia'],
  ] as const)('%s → %j', (referenceDb, label) => {
    expect(referenceCodeLabel(referenceDb)).toBe(label)
  })
})

describe('carbsLabel', () => {
  it.each([
    ['argenfoods', 'raw_cooked', 'HC asimilables cada 100 g, en crudo'],
    ['argenfoods', 'as_eaten', 'HC asimilables cada 100 g'],
    ['argenfoods', null, 'HC asimilables cada 100 g'],
    ['usda_fdc', 'raw_cooked', 'HC cada 100 g, en crudo (sin fibra)'],
    ['usda_fdc', 'as_eaten', 'HC cada 100 g (sin fibra)'],
    ['usda_fdc', null, 'HC cada 100 g (sin fibra)'],
    [null, 'raw_cooked', 'HC cada 100 g, en crudo (sin fibra)'],
    [null, 'as_eaten', 'HC cada 100 g (sin fibra)'],
    [null, null, 'HC cada 100 g (sin fibra)'],
  ] as const)('%s + %s → %j', (referenceDb, state, label) => {
    expect(carbsLabel(referenceDb, state)).toBe(label)
  })
})
