import { describe, expect, it } from 'vitest'
import {
  calculateMeal,
  cookedGramsPer100gRaw,
  formatCarbs,
  formatDose,
  formatGrams,
  formatUserNumber,
  type DoseSettings,
  type ItemSuccess,
  type MealItemInput,
} from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'
import type { Settings } from '../../lib/settings.ts'
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
} from './breakdown.ts'
import { toMealItemInput, toNewMealRecord } from './mealDraft.ts'
import {
  savedMealItemSchema,
  savedMealSchema,
  type MealItemDraft,
  type NewMealItem,
  type SavedMealItem,
} from './types.ts'

// Invented data: the illustrative values of spec §8.3.

const settings: DoseSettings = {
  carbRatioGPerUnit: 15,
  maxDoseWarningUnits: null,
  maxItemGramsWarning: 500,
}

const rice: MealItemInput = {
  foodState: 'raw_cooked',
  carbsPer100g: 78,
  cookingFactor: 2.6,
  unitWeightG: null,
  quantityMode: 'grams',
  quantity: 250,
}

const banana: MealItemInput = {
  foodState: 'as_eaten',
  carbsPer100g: 20.2,
  cookingFactor: null,
  unitWeightG: null,
  quantityMode: 'grams',
  quantity: 120,
}

const alfajor: MealItemInput = {
  foodState: 'as_eaten',
  carbsPer100g: 58,
  cookingFactor: null,
  unitWeightG: 50,
  quantityMode: 'units',
  quantity: 1,
}

/** The calculation of one valid item, through calculateMeal. */
function success(input: MealItemInput): ItemSuccess {
  const result = calculateMeal([input], settings)
  const item = result.items[0]
  if (item === undefined || !item.ok) throw new Error('invalid test item')
  return item
}

function lines(input: MealItemInput): string[] {
  return itemCalculationLines(input, success(input))
}

describe('the breakdown of spec §8.3, line by line', () => {
  it('rice (raw, eaten cooked)', () => {
    const food = {
      state: 'raw_cooked',
      carbs_per_100g: 78,
      cooking_factor: 2.6,
    } as const
    expect(foodLines(food)).toEqual([
      '78,0 g de HC cada 100 g en crudo',
      '100 g crudo rinden 260 g cocido',
    ])
    expect(lines(rice)).toEqual([
      'Cocido: 78,0 × 100 ÷ 260 = 30,0 g de HC cada 100 g',
      '250 g cocido × 30,0 ÷ 100 = 75,0 g HC',
    ])
    expect(itemCarbsText(success(rice).carbsG)).toBe('75,0 g de HC')
  })

  it('banana (as eaten, grams)', () => {
    expect(
      foodLines({
        state: 'as_eaten',
        carbs_per_100g: 20.2,
        cooking_factor: null,
      }),
    ).toEqual(['20,2 g de HC cada 100 g'])
    expect(lines(banana)).toEqual(['120 g × 20,2 ÷ 100 = 24,2 g HC'])
    expect(itemCarbsText(success(banana).carbsG)).toBe('24,2 g de HC')
  })

  it('alfajor (1 unit of 50 g)', () => {
    expect(lines(alfajor)).toEqual([
      '1 × unidad de 50 g = 50 g',
      '50 g × 58,0 ÷ 100 = 29,0 g HC',
    ])
  })

  it('total and dose', () => {
    const result = calculateMeal([rice, banana, alfajor], settings)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(totalCarbsText(result.totalCarbsG)).toBe('HC total 128,2 g')
    expect(doseText(result.doseUnits)).toBe('Dosis 8,55\u00a0unidades')
    expect(doseLine(result.totalCarbsG, 15, result.doseUnits)).toBe(
      'Dosis = 128,2 ÷ 15 = 8,55\u00a0unidades',
    )
  })
})

describe('itemCalculationLines, units', () => {
  const half = { ...alfajor, unitWeightG: 45, quantity: 0.5 }

  it('0,5 units of 45 g', () => {
    expect(lines(half)).toEqual([
      '0,5 × unidad de 45 g = 22,5 g',
      '22,5 g × 58,0 ÷ 100 = 13,1 g HC',
    ])
  })

  it.each([
    [2, '2 ×'],
    [1.5, '1,5 ×'],
    [1, '1 ×'],
  ])('%s → "%s", never "unidades" (kept for insulin)', (quantity, text) => {
    const first = lines({ ...alfajor, quantity })[0]
    expect(first?.startsWith(`${text} unidad de `)).toBe(true)
    expect(first).not.toContain('unidades')
  })

  it('with the name of the unit: "0,5 × alfajor de 45 g = 22,5 g"', () => {
    expect(itemCalculationLines(half, success(half), 'alfajor')).toEqual([
      '0,5 × alfajor de 45 g = 22,5 g',
      '22,5 g × 58,0 ÷ 100 = 13,1 g HC',
    ])
    expect(
      itemCalculationLines(
        { ...alfajor, quantity: 2 },
        success({ ...alfajor, quantity: 2 }),
        'galletita',
      )[0],
    ).toBe('2 × galletita de 50 g = 100 g')
  })

  it('the name of the unit is ignored outside units mode', () => {
    expect(itemCalculationLines(banana, success(banana), 'alfajor')).toEqual(
      lines(banana),
    )
  })

  it('"1,0" typed is 1 unit (the parsed number is shown)', () => {
    // parseUserNumber("1,0") is 1, so the item gets quantity 1.
    expect(lines({ ...alfajor, quantity: 1.0 })[0]).toBe(
      '1 × unidad de 50 g = 50 g',
    )
  })

  it('a unit weight with decimals is shown with formatGrams', () => {
    expect(lines({ ...alfajor, unitWeightG: 9.5, quantity: 3 })[0]).toBe(
      '3 × unidad de 9,5 g = 28,5 g',
    )
  })

  it('a typed quantity of units is exact (thousands grouped)', () => {
    expect(lines({ ...alfajor, unitWeightG: 1, quantity: 1500 })[0]).toBe(
      '1.500 × unidad de 1 g = 1500 g',
    )
  })
})

describe('itemCalculationLines, grams', () => {
  it('grams with 2 decimals are shown with 1 ("250,25" → "250,3 g")', () => {
    expect(lines({ ...banana, quantity: 250.25 })[0]).toMatch(/^250,3 g × /)
  })

  it('a food without carbs gives "0,0 g HC"', () => {
    expect(lines({ ...banana, carbsPer100g: 0 })).toEqual([
      '120 g × 0,0 ÷ 100 = 0,0 g HC',
    ])
  })

  it('an as_eaten food ignores a cooking factor it carries', () => {
    expect(lines({ ...banana, cookingFactor: 2 })).toEqual([
      '120 g × 20,2 ÷ 100 = 24,2 g HC',
    ])
  })

  it('a cooked item with decimals in the grams', () => {
    expect(lines({ ...rice, quantity: 0.1 })).toEqual([
      'Cocido: 78,0 × 100 ÷ 260 = 30,0 g de HC cada 100 g',
      '0,1 g cocido × 30,0 ÷ 100 = 0,0 g HC',
    ])
  })
})

describe('foodCarbsLine', () => {
  it.each([2.6, null, 0])(
    'raw_cooked says "en crudo", with or without a factor (%s)',
    (factor) => {
      const food = {
        state: 'raw_cooked',
        carbs_per_100g: 78,
        cooking_factor: factor,
      } as const
      expect(foodCarbsLine(food)).toBe('78,0 g de HC cada 100 g en crudo')
    },
  )

  it('as_eaten ignores a factor it carries', () => {
    const food = {
      state: 'as_eaten',
      carbs_per_100g: 50,
      cooking_factor: 2,
    } as const
    expect(foodCarbsLine(food)).toBe('50,0 g de HC cada 100 g')
    expect(foodLines(food)).toEqual(['50,0 g de HC cada 100 g'])
  })

  it('rounds for display only', () => {
    expect(foodCarbsLine({ state: 'raw_cooked', carbs_per_100g: 72.25 })).toBe(
      '72,3 g de HC cada 100 g en crudo',
    )
  })
})

describe('foodYieldLine', () => {
  it.each([
    [2.6, '100 g crudo rinden 260 g cocido'],
    [8 / 3, '100 g crudo rinden 266,7 g cocido'],
    [0.9, '100 g crudo rinden 90 g cocido'],
    [1, '100 g crudo rinden 100 g cocido'],
    [4.5, '100 g crudo rinden 450 g cocido'],
  ])('raw_cooked with %s → %j', (factor, text) => {
    expect(foodYieldLine({ state: 'raw_cooked', cooking_factor: factor })).toBe(
      text,
    )
  })

  it.each([null, 0, -1, NaN, Infinity, 1e307])(
    'raw_cooked with %s → null',
    (factor) => {
      expect(
        foodYieldLine({ state: 'raw_cooked', cooking_factor: factor }),
      ).toBeNull()
    },
  )

  it('as_eaten with a factor → null', () => {
    expect(foodYieldLine({ state: 'as_eaten', cooking_factor: 2.6 })).toBeNull()
  })

  it('foodLines leaves out a yield that is missing or cannot be shown', () => {
    expect(
      foodLines({
        state: 'raw_cooked',
        carbs_per_100g: 78,
        cooking_factor: null,
      }),
    ).toEqual(['78,0 g de HC cada 100 g en crudo'])
    expect(
      foodLines({
        state: 'raw_cooked',
        carbs_per_100g: 50,
        cooking_factor: 1e307,
      }),
    ).toEqual(['50,0 g de HC cada 100 g en crudo'])
  })
})

describe('the texts in sight', () => {
  it.each([
    [75, '75,0 g de HC'],
    [0, '0,0 g de HC'],
    [24.24, '24,2 g de HC'],
    [0.05, '0,1 g de HC'],
    [1500.25, '1500,3 g de HC'],
  ])('itemCarbsText(%s) → %j', (carbs, text) => {
    expect(itemCarbsText(carbs)).toBe(text)
  })

  it.each([
    [128.24, 'HC total 128,2 g'],
    [0, 'HC total 0,0 g'],
    [15.05, 'HC total 15,1 g'],
  ])('totalCarbsText(%s) → %j', (total, text) => {
    expect(totalCarbsText(total)).toBe(text)
  })

  it.each([
    [8.546666666666667, 'Dosis 8,55\u00a0unidades'],
    [0, 'Dosis 0,00\u00a0unidades'],
    [1.005, 'Dosis 1,01\u00a0unidades'],
    [2.675, 'Dosis 2,68\u00a0unidades'],
  ])('doseText(%s) → %j', (dose, text) => {
    expect(doseText(dose)).toBe(text)
  })

  it('a calculated dose of exactly 1 keeps its two decimals, in plural', () => {
    expect(doseText(1)).toBe('Dosis 1,00\u00a0unidades')
  })

  it.each([
    [128.24, '128,2 g'],
    [0, '0,0 g'],
    [-0, '0,0 g'],
    [15.05, '15,1 g'],
    [1234.56, '1234,6 g'],
  ])('displayCarbsText(%s) → %j', (total, text) => {
    expect(displayCarbsText(total)).toBe(text)
  })

  it.each([
    [15, 'Ratio: 1 unidad cada 15 g de HC'],
    [12.5, 'Ratio: 1 unidad cada 12,5 g de HC'],
    [7.125, 'Ratio: 1 unidad cada 7,125 g de HC'],
    [0.5, 'Ratio: 1 unidad cada 0,5 g de HC'],
    [1500, 'Ratio: 1 unidad cada 1.500 g de HC'],
  ])('ratioText(%s) → %j, with the ratio exact', (ratio, text) => {
    expect(ratioText(ratio)).toBe(text)
  })

  it('the dose texts never say "U"', () => {
    for (const text of [
      doseText(8.55),
      doseText(1),
      doseLine(128.2, 15, 128.2 / 15),
      ratioText(15),
    ]) {
      expect(text).not.toMatch(/\bU\b/)
    }
  })
})

describe('doseLine', () => {
  it('a ratio with decimals is shown exact', () => {
    expect(doseLine(25, 12.5, 2)).toBe(
      'Dosis = 25,0 ÷ 12,5 = 2,00\u00a0unidades',
    )
  })

  it('the dose is rounded half up (1,005 → 1,01)', () => {
    expect(doseLine(15.075, 15, 1.005)).toBe(
      'Dosis = 15,1 ÷ 15 = 1,01\u00a0unidades',
    )
  })

  it('a total of 0', () => {
    expect(doseLine(0, 15, 0)).toBe('Dosis = 0,0 ÷ 15 = 0,00\u00a0unidades')
  })
})

// A grid of valid items, shared by the coherence tests of the live lines
// and of the saved ones.
const cases: MealItemInput[] = [
  rice,
  banana,
  alfajor,
  { ...rice, quantity: 187.35, cookingFactor: 8 / 3 },
  { ...rice, carbsPer100g: 50, cookingFactor: 0.8 },
  { ...rice, carbsPer100g: 0, cookingFactor: 3.1 },
  { ...banana, quantity: 0.1 },
  { ...banana, quantity: 1234.56, carbsPer100g: 100 },
  { ...banana, quantity: 33.333333, carbsPer100g: 12.345 },
  { ...alfajor, quantity: 0.25, unitWeightG: 33.3 },
  { ...alfajor, quantity: 7, unitWeightG: 12.75 },
  { ...alfajor, quantity: 2.5, unitWeightG: 0.1 },
]

describe('the lines show the numbers of calculateMeal', () => {
  // Coherence: each line only formats what the calculation returns, so the
  // numbers in the text are the formatted grams, effective carbs and carbs
  // of the result, for many inputs.
  it.each(cases)('%o', (input) => {
    const result = success(input)
    const out = itemCalculationLines(input, result)
    const last = out[out.length - 1]
    const grams = formatGrams(result.grams)
    const effective = formatCarbs(result.effectiveCarbsPer100g)
    expect(last).toBe(
      input.foodState === 'raw_cooked'
        ? `${grams} g cocido × ${effective} ÷ 100 = ${formatCarbs(result.carbsG)} g HC`
        : `${grams} g × ${effective} ÷ 100 = ${formatCarbs(result.carbsG)} g HC`,
    )
    if (input.foodState === 'raw_cooked') {
      expect(out).toHaveLength(2)
      expect(out[0]).toBe(
        `Cocido: ${formatCarbs(input.carbsPer100g ?? NaN)} × 100 ÷ ${formatGrams(cookedGramsPer100gRaw(input.cookingFactor ?? NaN) ?? NaN)} = ${effective} g de HC cada 100 g`,
      )
    } else if (input.quantityMode === 'units') {
      expect(out).toHaveLength(2)
      expect(out[0]?.endsWith(` = ${grams} g`)).toBe(true)
    } else {
      expect(out).toHaveLength(1)
    }
  })

  it('the total and dose lines use the totals of the result', () => {
    const items = cases.filter((input) => input.foodState === 'as_eaten')
    const result = calculateMeal(items, { ...settings, carbRatioGPerUnit: 7.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(totalCarbsText(result.totalCarbsG)).toBe(
      `HC total ${formatCarbs(result.totalCarbsG)} g`,
    )
    expect(doseText(result.doseUnits)).toBe(
      `Dosis ${formatDose(result.doseUnits)}\u00a0unidades`,
    )
    expect(doseLine(result.totalCarbsG, 7.5, result.doseUnits)).toBe(
      `Dosis = ${formatCarbs(result.totalCarbsG)} ÷ 7,5 = ${formatDose(result.doseUnits)}\u00a0unidades`,
    )
  })
})

describe('itemCalculationLines: bordes', () => {
  it('a factor below 1 that is still valid (100 g rinden 80 g)', () => {
    expect(lines({ ...rice, carbsPer100g: 50, cookingFactor: 0.8 })).toEqual([
      'Cocido: 50,0 × 100 ÷ 80 = 62,5 g de HC cada 100 g',
      '250 g cocido × 62,5 ÷ 100 = 156,3 g HC',
    ])
  })

  it('a factor whose yield cannot be shown leaves the calculation out', () => {
    // 50 ÷ 1e307 is a valid effective (5e-306) that is shown as 0,0.
    const input = { ...rice, carbsPer100g: 50, cookingFactor: 1e307 }
    expect(success(input).effectiveCarbsPer100g).toBe(50 / 1e307)
    expect(lines(input)).toEqual([
      'Cocido: 0,0 g de HC cada 100 g',
      '250 g cocido × 0,0 ÷ 100 = 0,0 g HC',
    ])
  })

  it('a cooked yield with decimals (8/3 → 266,7)', () => {
    expect(lines({ ...rice, cookingFactor: 8 / 3 })[0]).toBe(
      'Cocido: 78,0 × 100 ÷ 266,7 = 29,3 g de HC cada 100 g',
    )
  })

  it('a food with 100 g/100 g of carbs', () => {
    expect(lines({ ...banana, carbsPer100g: 100, quantity: 10 })).toEqual([
      '10 g × 100,0 ÷ 100 = 10,0 g HC',
    ])
  })

  it('a quarter unit', () => {
    expect(lines({ ...alfajor, quantity: 0.25 })[0]).toBe(
      '0,25 × unidad de 50 g = 12,5 g',
    )
  })

  it('a quantity close to 1 is not "1 unidad"', () => {
    expect(lines({ ...alfajor, quantity: 1.0001 })[0]).toBe(
      '1,0001 × unidad de 50 g = 50 g',
    )
  })

  it('a unit weight with many decimals is rounded to 1 decimal', () => {
    expect(lines({ ...alfajor, unitWeightG: 45.25, quantity: 1 })[0]).toBe(
      '1 × unidad de 45,3 g = 45,3 g',
    )
  })

  it('grams that round to a whole number do not show ",0"', () => {
    expect(lines({ ...banana, quantity: 99.96 })[0]).toMatch(/^100 g × /)
  })

  it('does not modify the input nor the result', () => {
    const input = { ...alfajor, quantity: 0.5 }
    const result = success(input)
    const before = structuredClone({ input, result })
    itemCalculationLines(input, result)
    expect({ input, result }).toEqual(before)
  })
})

describe('foodCarbsLine: bordes', () => {
  it.each([
    [0, '0,0 g de HC cada 100 g'],
    [100, '100,0 g de HC cada 100 g'],
    [0.05, '0,1 g de HC cada 100 g'],
    [20.2, '20,2 g de HC cada 100 g'],
  ])('as_eaten %s → %s', (carbs, text) => {
    expect(foodCarbsLine({ state: 'as_eaten', carbs_per_100g: carbs })).toBe(
      text,
    )
  })

  it('raw_cooked with a factor of 0 has no yield line (the item shows the error)', () => {
    const food = {
      state: 'raw_cooked',
      carbs_per_100g: 78,
      cooking_factor: 0,
    } as const
    expect(foodLines(food)).toEqual(['78,0 g de HC cada 100 g en crudo'])
  })
})

describe('doseLine: bordes', () => {
  it('a ratio with many decimals is shown exact', () => {
    expect(doseLine(30, 12.25, 30 / 12.25)).toBe(
      'Dosis = 30,0 ÷ 12,25 = 2,45\u00a0unidades',
    )
  })

  it('a dose of 2,675 rounds half up to 2,68', () => {
    expect(doseLine(40.125, 15, 2.675)).toBe(
      'Dosis = 40,1 ÷ 15 = 2,68\u00a0unidades',
    )
  })

  it('never shows "-0"', () => {
    expect(doseLine(-0, 15, -0)).toBe('Dosis = 0,0 ÷ 15 = 0,00\u00a0unidades')
  })

  it('a ratio below 1 and one with three decimals are shown exact', () => {
    expect(doseLine(10, 0.5, 20)).toBe(
      'Dosis = 10,0 ÷ 0,5 = 20,00\u00a0unidades',
    )
    expect(doseLine(10, 7.125, 10 / 7.125)).toBe(
      'Dosis = 10,0 ÷ 7,125 = 1,40\u00a0unidades',
    )
  })

  it('a dose that does not end (50 ÷ 3) is rounded only when shown', () => {
    expect(doseLine(50, 3, 50 / 3)).toBe(
      'Dosis = 50,0 ÷ 3 = 16,67\u00a0unidades',
    )
  })

  it('tiny values round to zero, without "-" or exponent', () => {
    expect(doseLine(0.04, 15, 0.04 / 15)).toBe(
      'Dosis = 0,0 ÷ 15 = 0,00\u00a0unidades',
    )
  })

  it('large values, without thousands separator', () => {
    expect(doseLine(12345.67, 1, 12345.67)).toBe(
      'Dosis = 12345,7 ÷ 1 = 12345,67\u00a0unidades',
    )
  })

  it('is only the dose: there is no sum of the items (spec §14 #52 (5))', () => {
    const line = doseLine(128.2, 15, 128.2 / 15)
    expect(line).not.toContain('+')
    expect(line).not.toMatch(/HC total/)
  })
})

// --- The lines of a saved item (history detail, spec §6.7) ---

// Saved items with the values of spec §8.3, as the history reads them.
// The row the base keeps for an item: food_id instead of the food it
// points to (a table food not copied yet gets an invented id).
function asStoredItem({ food, ...row }: NewMealItem) {
  return {
    ...row,
    food_id: 'id' in food ? food.id : '00000000-0000-4000-8000-0000000000ff',
  }
}

const savedRice: SavedMealItem = {
  position: 0,
  food_id: '00000000-0000-4000-8000-000000000001',
  food_name: 'Arroz de prueba',
  food_brand: null,
  food_state: 'raw_cooked',
  quantity_mode: 'grams',
  units: null,
  unit_weight_g: null,
  grams: 250,
  carbs_per_100g: 78,
  cooking_factor: 2.6,
  effective_carbs_per_100g: 30,
  carbs_g: 75,
}

const savedBanana: SavedMealItem = {
  position: 1,
  food_id: '00000000-0000-4000-8000-000000000002',
  food_name: 'Banana de prueba',
  food_brand: null,
  food_state: 'as_eaten',
  quantity_mode: 'grams',
  units: null,
  unit_weight_g: null,
  grams: 120,
  carbs_per_100g: 20.2,
  cooking_factor: null,
  effective_carbs_per_100g: 20.2,
  carbs_g: 24.24,
}

const savedAlfajor: SavedMealItem = {
  position: 2,
  food_id: '00000000-0000-4000-8000-000000000003',
  food_name: 'Alfajor de prueba',
  food_brand: 'Marca Inventada',
  food_state: 'as_eaten',
  quantity_mode: 'units',
  units: 1,
  unit_weight_g: 50,
  grams: 50,
  carbs_per_100g: 58,
  cooking_factor: null,
  effective_carbs_per_100g: 58,
  carbs_g: 29,
}

describe('savedItemLines: the breakdown of spec §8.3, saved', () => {
  it('rice (raw, eaten cooked)', () => {
    expect(savedItemLines(savedRice)).toEqual([
      '78,0 g de HC cada 100 g en crudo',
      '100 g crudo rinden 260 g cocido',
      'Cocido: 78,0 × 100 ÷ 260 = 30,0 g de HC cada 100 g',
      '250 g cocido × 30,0 ÷ 100 = 75,0 g HC',
    ])
  })

  it('banana (as eaten, grams)', () => {
    expect(savedItemLines(savedBanana)).toEqual([
      '20,2 g de HC cada 100 g',
      '120 g × 20,2 ÷ 100 = 24,2 g HC',
    ])
  })

  it('alfajor (1 unit of 50 g)', () => {
    expect(savedItemLines(savedAlfajor)).toEqual([
      '58,0 g de HC cada 100 g',
      '1 × unidad de 50 g = 50 g',
      '50 g × 58,0 ÷ 100 = 29,0 g HC',
    ])
  })

  it('0,5 units of 45 g', () => {
    expect(
      savedItemLines({
        ...savedAlfajor,
        units: 0.5,
        unit_weight_g: 45,
        grams: 22.5,
        carbs_g: 13.05,
      }),
    ).toEqual([
      '58,0 g de HC cada 100 g',
      '0,5 × unidad de 45 g = 22,5 g',
      '22,5 g × 58,0 ÷ 100 = 13,1 g HC',
    ])
  })

  it('the dose line of a saved meal shows its ratio (12,5)', () => {
    expect(doseLine(25, 12.5, 2)).toContain('÷ 12,5 =')
  })
})

describe('savedItemLines: does not calculate again', () => {
  it('shows the saved effective carbs, not 78 ÷ 2,6', () => {
    // An inconsistent record (the CHECKs would not allow it): the detail
    // shows what was saved, without recalculating.
    expect(
      savedItemLines({ ...savedRice, effective_carbs_per_100g: 31 })[2],
    ).toBe('Cocido: 78,0 × 100 ÷ 260 = 31,0 g de HC cada 100 g')
  })

  it('shows the saved grams and carbs', () => {
    expect(savedItemLines({ ...savedBanana, grams: 100, carbs_g: 50 })[1]).toBe(
      '100 g × 20,2 ÷ 100 = 50,0 g HC',
    )
  })

  it('in units, shows the saved grams, not units × weight', () => {
    // Also inconsistent on purpose: 1 × 50 would be 50 g.
    expect(
      savedItemLines({ ...savedAlfajor, grams: 52, carbs_g: 30.16 }),
    ).toEqual([
      '58,0 g de HC cada 100 g',
      '1 × unidad de 50 g = 52 g',
      '52 g × 58,0 ÷ 100 = 30,2 g HC',
    ])
  })

  it('shows the saved raw carbs and factor in the first lines', () => {
    // An effective of 30 that does not come from 80 ÷ 2,5 (= 32).
    expect(
      savedItemLines({ ...savedRice, carbs_per_100g: 80, cooking_factor: 2.5 }),
    ).toEqual([
      '80,0 g de HC cada 100 g en crudo',
      '100 g crudo rinden 250 g cocido',
      'Cocido: 80,0 × 100 ÷ 250 = 30,0 g de HC cada 100 g',
      '250 g cocido × 30,0 ÷ 100 = 75,0 g HC',
    ])
  })

  it('a saved factor whose yield cannot be shown', () => {
    expect(
      savedItemLines({
        ...savedRice,
        carbs_per_100g: 50,
        cooking_factor: 1e307,
        effective_carbs_per_100g: 50 / 1e307,
        carbs_g: (250 * (50 / 1e307)) / 100,
      }),
    ).toEqual([
      '50,0 g de HC cada 100 g en crudo',
      'Cocido: 0,0 g de HC cada 100 g',
      '250 g cocido × 0,0 ÷ 100 = 0,0 g HC',
    ])
  })

  it('an as_eaten item does not say how much it yields', () => {
    const lines = savedItemLines(savedBanana)
    expect(lines.some((line) => line.includes('rinden'))).toBe(false)
    expect(lines.some((line) => line.includes('cocido'))).toBe(false)
    expect(lines.some((line) => line.includes('crudo'))).toBe(false)
  })

  it('does not modify the item', () => {
    const item = structuredClone(savedAlfajor)
    savedItemLines(item)
    expect(item).toEqual(savedAlfajor)
  })
})

describe('savedItemLines: the same lines the meal screen showed', () => {
  // Equivalence: an item goes through the meal screen (draft → calculateMeal
  // → toNewMealRecord), is saved, comes back as JSON and is validated; the
  // detail shows exactly the lines the screen showed.
  const userSettings: Settings = {
    user_id: '00000000-0000-4000-8000-0000000000ff',
    carb_ratio_g_per_unit: 15,
    max_dose_warning_units: null,
    max_item_grams_warning: 500,
  }

  function draftOf(input: MealItemInput, key: number): MealItemDraft {
    if (input.carbsPer100g === null || input.quantity === null) {
      throw new Error('invalid test item')
    }
    const food: Food = {
      id: `00000000-0000-4000-8000-${String(key).padStart(12, '0')}`,
      name: `Alimento de prueba ${key}`,
      brand: null,
      source: 'manual',
      state: input.foodState,
      carbs_per_100g: input.carbsPer100g,
      cooking_factor: input.cookingFactor,
      unit_weight_g: input.unitWeightG,
      unit_label: null,
      reference_db: null,
      reference_code: null,
      reference_description: null,
      notes: 'Inventado',
      photo_path: null,
      archived_at: null,
    }
    return {
      key,
      food,
      quantityMode: input.quantityMode,
      quantityText: formatUserNumber(input.quantity),
    }
  }

  const inputs: MealItemInput[] = [
    ...cases,
    { ...alfajor, unitWeightG: 45, quantity: 0.5 },
    // An as_eaten food that carries a factor (saved as null).
    { ...banana, cookingFactor: 2 },
    // A food with a weight per unit, entered in grams.
    { ...alfajor, quantityMode: 'grams', quantity: 30 },
  ]

  it('for every item of the grid', () => {
    const drafts = inputs.map(draftOf)
    const result = calculateMeal(drafts.map(toMealItemInput), {
      carbRatioGPerUnit: userSettings.carb_ratio_g_per_unit,
      maxDoseWarningUnits: userSettings.max_dose_warning_units,
      maxItemGramsWarning: userSettings.max_item_grams_warning,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const record = toNewMealRecord(
      drafts,
      result,
      userSettings,
      result.doseUnits,
      '2026-11-14T16:05:00.000Z',
    )
    expect(record.items).toHaveLength(drafts.length)

    record.items.forEach((item, index) => {
      const draft = drafts[index]
      const calc = result.items[index]
      if (draft === undefined || calc === undefined) throw new Error('missing')
      const saved = savedMealItemSchema.parse(
        JSON.parse(JSON.stringify(asStoredItem(item))) as unknown,
      )
      expect(savedItemLines(saved)).toEqual([
        ...foodLines(draft.food),
        ...itemCalculationLines(toMealItemInput(draft), calc),
      ])
    })
  })

  // The edges of the CHECKs and of the formatting, one meal per ratio. The
  // detail (items, total and dose line) has to show what Inicio showed.
  const edges: MealItemInput[] = [
    // Factor 1: the effective is the raw value.
    { ...rice, cookingFactor: 1 },
    // Effective carbs at the ends (0 and 100).
    { ...rice, carbsPer100g: 100, cookingFactor: 1 },
    { ...banana, carbsPer100g: 0 },
    { ...banana, carbsPer100g: 100, quantity: 0.001 },
    // A raw food with a weight per unit (always in grams; saved as null).
    { ...rice, unitWeightG: 80 },
    { ...rice, quantity: 0.05, cookingFactor: 3.999 },
    { ...rice, quantity: 1000, cookingFactor: 2.5 },
    // Units whose grams are not exact in binary (3 × 0,1).
    { ...alfajor, quantity: 3, unitWeightG: 0.1 },
    { ...alfajor, quantity: 1.333, unitWeightG: 30 },
    { ...alfajor, quantity: 1000, unitWeightG: 50 },
    { ...alfajor, quantity: 0.001, unitWeightG: 45 },
    // Halves that round (the 5 of the second decimal).
    { ...banana, quantity: 0.25, carbsPer100g: 10 },
    { ...banana, quantity: 105, carbsPer100g: 12.3 },
  ]

  it.each([15, 12.5, 7.25, 1, 0.5, 100])(
    'the edges, with a ratio of %s: items, total and dose',
    (ratio) => {
      const ratioSettings: Settings = {
        ...userSettings,
        carb_ratio_g_per_unit: ratio,
      }
      const drafts = edges.map(draftOf)
      const result = calculateMeal(drafts.map(toMealItemInput), {
        carbRatioGPerUnit: ratio,
        maxDoseWarningUnits: ratioSettings.max_dose_warning_units,
        maxItemGramsWarning: ratioSettings.max_item_grams_warning,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const record = toNewMealRecord(
        drafts,
        result,
        ratioSettings,
        result.doseUnits,
        '2026-11-14T16:05:00.000Z',
      )
      // The row the detail reads: the meal with its items embedded.
      const saved = savedMealSchema.parse(
        JSON.parse(
          JSON.stringify({
            id: '00000000-0000-4000-8000-0000000000aa',
            ...record.meal,
            meal_items: record.items.map(asStoredItem),
          }),
        ) as unknown,
      )

      saved.meal_items.forEach((item, index) => {
        const draft = drafts[index]
        const calc = result.items[index]
        if (draft === undefined || calc === undefined) {
          throw new Error('missing')
        }
        expect(savedItemLines(item)).toEqual([
          ...foodLines(draft.food),
          ...itemCalculationLines(toMealItemInput(draft), calc),
        ])
      })
      expect(totalCarbsText(saved.total_carbs_g)).toBe(
        totalCarbsText(result.totalCarbsG),
      )
      expect(doseText(saved.calculated_dose_units)).toBe(
        doseText(result.doseUnits),
      )
      saved.meal_items.forEach((item, index) => {
        expect(itemCarbsText(item.carbs_g)).toBe(
          itemCarbsText(result.items[index]?.carbsG ?? NaN),
        )
      })
      expect(
        doseLine(
          saved.total_carbs_g,
          saved.carb_ratio_g_per_unit,
          saved.calculated_dose_units,
        ),
      ).toBe(
        doseLine(
          result.totalCarbsG,
          ratioSettings.carb_ratio_g_per_unit,
          result.doseUnits,
        ),
      )
    },
  )
})

describe('the texts in sight: -0', () => {
  it('never show "-0"', () => {
    expect(itemCarbsText(-0)).toBe('0,0 g de HC')
    expect(totalCarbsText(-0)).toBe('HC total 0,0 g')
    expect(doseText(-0)).toBe('Dosis 0,00\u00a0unidades')
  })
})

describe('foodYieldLine: bounds of the usual range', () => {
  it.each([
    [4.0004, '100 g crudo rinden 400 g cocido'],
    [3.999, '100 g crudo rinden 399,9 g cocido'],
    [0.999, '100 g crudo rinden 99,9 g cocido'],
  ])('%s → %j', (factor, text) => {
    expect(foodYieldLine({ state: 'raw_cooked', cooking_factor: factor })).toBe(
      text,
    )
  })

  it('as_eaten without a factor → null', () => {
    expect(
      foodYieldLine({ state: 'as_eaten', cooking_factor: null }),
    ).toBeNull()
  })
})
