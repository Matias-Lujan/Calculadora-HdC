import { describe, expect, it } from 'vitest'
import { calculateMeal } from './calculate.ts'
import { doseForCarbs } from './doseForCarbs.ts'
import type { DoseSettings, MealItemInput } from './types.ts'

describe('doseForCarbs', () => {
  it.each([
    [60, 15, 4],
    [60, 12, 5],
    [60, 60, 1],
    [60, 120, 0.5],
    [75, 15, 5],
    [128.24, 15, 128.24 / 15],
    [60, 14, 60 / 14],
    [10, 3, 10 / 3],
    [25, 12.5, 2],
    [0, 15, 0],
  ])('%s g ÷ %s = %s, exact', (carbs, ratio, dose) => {
    expect(doseForCarbs(carbs, ratio)).toBe(dose)
  })

  it('never rounds', () => {
    expect(doseForCarbs(60, 14)).toBe(4.285714285714286)
    expect(doseForCarbs(10, 3)).toBe(3.3333333333333335)
  })

  it('a ratio below 1 gives more units than grams', () => {
    expect(doseForCarbs(10, 0.5)).toBe(20)
  })

  it.each([0, -0, -15, NaN, Infinity, -Infinity])(
    'a ratio of %s is not valid → null',
    (ratio) => {
      expect(doseForCarbs(60, ratio)).toBeNull()
    },
  )

  it.each([-1, -0.001, NaN, Infinity, -Infinity])(
    'carbs of %s are not valid → null',
    (carbs) => {
      expect(doseForCarbs(carbs, 15)).toBeNull()
    },
  )

  it('-0 g of carbs is a dose of zero (the formats never show "-0")', () => {
    expect(doseForCarbs(-0, 15) === 0).toBe(true)
  })

  it('a tiny ratio that makes the dose overflow → null', () => {
    expect(doseForCarbs(60, Number.MIN_VALUE)).toBeNull()
    expect(doseForCarbs(Number.MAX_VALUE, 0.5)).toBeNull()
  })

  it('a dose just below the overflow is still a number', () => {
    expect(doseForCarbs(Number.MAX_VALUE, 1)).toBe(Number.MAX_VALUE)
  })
})

describe('calculateMeal divides with doseForCarbs (same result)', () => {
  function asEaten(carbsPer100g: number, grams: number): MealItemInput {
    return {
      foodState: 'as_eaten',
      carbsPer100g,
      cookingFactor: null,
      unitWeightG: null,
      quantityMode: 'grams',
      quantity: grams,
    }
  }

  const meals: MealItemInput[][] = [
    [asEaten(20.2, 120)],
    [asEaten(78 / 2.6, 250), asEaten(20.2, 120), asEaten(58, 50)],
    [asEaten(12.345, 33.333333), asEaten(100, 1234.56)],
    [asEaten(0, 500)],
    [asEaten(0.1, 0.1)],
  ]
  const ratios = [15, 12.5, 7.125, 0.5, 1, 3, 1e-300]
  const cases = meals.flatMap((meal) =>
    ratios.map((ratio): [MealItemInput[], number] => [meal, ratio]),
  )

  it.each(cases)('%o with a ratio of %s', (meal, ratio) => {
    const settings: DoseSettings = {
      carbRatioGPerUnit: ratio,
      maxDoseWarningUnits: null,
      maxItemGramsWarning: 500_000,
    }
    const result = calculateMeal(meal, settings)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.doseUnits).toBe(doseForCarbs(result.totalCarbsG, ratio))
    expect(result.doseUnits).toBe(result.totalCarbsG / ratio)
  })

  it('a dose that overflows is the meal-level INVALID_QUANTITY', () => {
    const result = calculateMeal([asEaten(100, 1e300)], {
      carbRatioGPerUnit: 1e-300,
      maxDoseWarningUnits: null,
      maxItemGramsWarning: 500,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(['INVALID_QUANTITY'])
    expect(result.items.every((item) => item.ok)).toBe(true)
  })
})
