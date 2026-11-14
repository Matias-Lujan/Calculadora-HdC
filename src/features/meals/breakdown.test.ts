import { describe, expect, it } from 'vitest'
import {
  calculateMeal,
  formatCarbs,
  formatCookingFactor,
  formatDose,
  formatGrams,
  type DoseSettings,
  type ItemSuccess,
  type MealItemInput,
} from '../../domain/dose/index.ts'
import {
  doseLine,
  foodCarbsLine,
  itemCalculationLines,
  totalCarbsLine,
} from './breakdown.ts'

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
    expect(
      foodCarbsLine({
        state: 'raw_cooked',
        carbs_per_100g: 78,
        cooking_factor: 2.6,
      }),
    ).toBe('HC 78,0 g/100 g crudo, factor 2,60')
    expect(lines(rice)).toEqual([
      '78,0 ÷ 2,60 = 30,0 g/100 g cocido',
      '250 g cocido × 30,0 ÷ 100 = 75,0 g HC',
    ])
  })

  it('banana (as eaten, grams)', () => {
    expect(
      foodCarbsLine({
        state: 'as_eaten',
        carbs_per_100g: 20.2,
        cooking_factor: null,
      }),
    ).toBe('HC 20,2 g/100 g')
    expect(lines(banana)).toEqual(['120 g × 20,2 ÷ 100 = 24,2 g HC'])
  })

  it('alfajor (1 unit of 50 g)', () => {
    expect(lines(alfajor)).toEqual([
      '1 unidad × 50 g = 50 g',
      '50 g × 58,0 ÷ 100 = 29,0 g HC',
    ])
  })

  it('total and dose', () => {
    const result = calculateMeal([rice, banana, alfajor], settings)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(totalCarbsLine(result.totalCarbsG)).toBe('HC total = 128,2 g')
    expect(doseLine(result.totalCarbsG, 15, result.doseUnits)).toBe(
      'Dosis = 128,2 ÷ 15 = 8,55 U',
    )
  })
})

describe('itemCalculationLines, units', () => {
  const half = { ...alfajor, unitWeightG: 45, quantity: 0.5 }

  it('0,5 units of 45 g', () => {
    expect(lines(half)).toEqual([
      '0,5 unidades × 45 g = 22,5 g',
      '22,5 g × 58,0 ÷ 100 = 13,1 g HC',
    ])
  })

  it.each([
    [2, '2 unidades'],
    [1.5, '1,5 unidades'],
    [1, '1 unidad'],
  ])('%s → "%s"', (quantity, text) => {
    const first = lines({ ...alfajor, quantity })[0]
    expect(first?.startsWith(`${text} ×`)).toBe(true)
  })

  it('"1,0" typed is 1 unit (the parsed number is shown)', () => {
    // parseUserNumber("1,0") is 1, so the item gets quantity 1.
    expect(lines({ ...alfajor, quantity: 1.0 })[0]).toBe(
      '1 unidad × 50 g = 50 g',
    )
  })

  it('a unit weight with decimals is shown with formatGrams', () => {
    expect(lines({ ...alfajor, unitWeightG: 9.5, quantity: 3 })[0]).toBe(
      '3 unidades × 9,5 g = 28,5 g',
    )
  })

  it('a typed quantity of units is exact (thousands grouped)', () => {
    expect(lines({ ...alfajor, unitWeightG: 1, quantity: 1500 })[0]).toBe(
      '1.500 unidades × 1 g = 1500 g',
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
      '78,0 ÷ 2,60 = 30,0 g/100 g cocido',
      '0,1 g cocido × 30,0 ÷ 100 = 0,0 g HC',
    ])
  })
})

describe('foodCarbsLine', () => {
  it('raw_cooked without a factor leaves the factor out', () => {
    expect(
      foodCarbsLine({
        state: 'raw_cooked',
        carbs_per_100g: 78,
        cooking_factor: null,
      }),
    ).toBe('HC 78,0 g/100 g crudo')
  })

  it('as_eaten never shows a factor', () => {
    expect(
      foodCarbsLine({
        state: 'as_eaten',
        carbs_per_100g: 50,
        cooking_factor: 2,
      }),
    ).toBe('HC 50,0 g/100 g')
  })

  it('rounds for display only', () => {
    expect(
      foodCarbsLine({
        state: 'raw_cooked',
        carbs_per_100g: 72.25,
        cooking_factor: 8 / 3,
      }),
    ).toBe('HC 72,3 g/100 g crudo, factor 2,67')
  })
})

describe('totalCarbsLine and doseLine', () => {
  it('a ratio with decimals is shown exact', () => {
    expect(doseLine(25, 12.5, 2)).toBe('Dosis = 25,0 ÷ 12,5 = 2,00 U')
  })

  it('the dose is rounded half up (1,005 → 1,01)', () => {
    expect(doseLine(15.075, 15, 1.005)).toBe('Dosis = 15,1 ÷ 15 = 1,01 U')
  })

  it('a total of 0', () => {
    expect(totalCarbsLine(0)).toBe('HC total = 0,0 g')
    expect(doseLine(0, 15, 0)).toBe('Dosis = 0,0 ÷ 15 = 0,00 U')
  })
})

describe('the lines show the numbers of calculateMeal', () => {
  // Coherence: each line only formats what the calculation returns, so the
  // numbers in the text are the formatted grams, effective carbs and carbs
  // of the result, for many inputs.
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
        `${formatCarbs(input.carbsPer100g ?? NaN)} ÷ ${formatCookingFactor(input.cookingFactor ?? NaN)} = ${effective} g/100 g cocido`,
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
    expect(totalCarbsLine(result.totalCarbsG)).toBe(
      `HC total = ${formatCarbs(result.totalCarbsG)} g`,
    )
    expect(doseLine(result.totalCarbsG, 7.5, result.doseUnits)).toBe(
      `Dosis = ${formatCarbs(result.totalCarbsG)} ÷ 7,5 = ${formatDose(result.doseUnits)} U`,
    )
  })
})

describe('itemCalculationLines: bordes', () => {
  it('a factor below 1 that is still valid (50 ÷ 0,80)', () => {
    expect(lines({ ...rice, carbsPer100g: 50, cookingFactor: 0.8 })).toEqual([
      '50,0 ÷ 0,80 = 62,5 g/100 g cocido',
      '250 g cocido × 62,5 ÷ 100 = 156,3 g HC',
    ])
  })

  it('a food with 100 g/100 g of carbs', () => {
    expect(lines({ ...banana, carbsPer100g: 100, quantity: 10 })).toEqual([
      '10 g × 100,0 ÷ 100 = 10,0 g HC',
    ])
  })

  it('a quarter unit', () => {
    expect(lines({ ...alfajor, quantity: 0.25 })[0]).toBe(
      '0,25 unidades × 50 g = 12,5 g',
    )
  })

  it('a quantity close to 1 is not "1 unidad"', () => {
    expect(lines({ ...alfajor, quantity: 1.0001 })[0]).toBe(
      '1,0001 unidades × 50 g = 50 g',
    )
  })

  it('a unit weight with many decimals is rounded to 1 decimal', () => {
    expect(lines({ ...alfajor, unitWeightG: 45.25, quantity: 1 })[0]).toBe(
      '1 unidad × 45,3 g = 45,3 g',
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
    [0, 'HC 0,0 g/100 g'],
    [100, 'HC 100,0 g/100 g'],
    [0.05, 'HC 0,1 g/100 g'],
  ])('as_eaten %s → %s', (carbs, text) => {
    expect(
      foodCarbsLine({
        state: 'as_eaten',
        carbs_per_100g: carbs,
        cooking_factor: null,
      }),
    ).toBe(text)
  })

  it('raw_cooked with a factor of 0 still shows it (the item shows the error)', () => {
    expect(
      foodCarbsLine({
        state: 'raw_cooked',
        carbs_per_100g: 78,
        cooking_factor: 0,
      }),
    ).toBe('HC 78,0 g/100 g crudo, factor 0,00')
  })
})

describe('doseLine: bordes', () => {
  it('a ratio with many decimals is shown exact', () => {
    expect(doseLine(30, 12.25, 30 / 12.25)).toBe(
      'Dosis = 30,0 ÷ 12,25 = 2,45 U',
    )
  })

  it('2,675 U rounds half up to 2,68', () => {
    expect(doseLine(40.125, 15, 2.675)).toBe('Dosis = 40,1 ÷ 15 = 2,68 U')
  })
})
