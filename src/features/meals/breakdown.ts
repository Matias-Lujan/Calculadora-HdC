import {
  formatCarbs,
  formatCookingFactor,
  formatDose,
  formatGrams,
  formatUserNumber,
  type ItemSuccess,
  type MealItemInput,
} from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'
import type { SavedMealItem } from './types.ts'

// The lines of the meal breakdown (spec §8.3). They only format: every
// number comes from the food, the typed input or calculateMeal's result
// (in the history, from the values saved in the record).
// Carbs with formatCarbs, cooking factor with formatCookingFactor, grams
// with formatGrams, dose with formatDose; typed units and the ratio exact,
// with formatUserNumber.

/**
 * The carbs of the food, always shown in the item: "HC 20,2 g/100 g", or
 * "HC 78,0 g/100 g crudo, factor 2,60" for a food eaten cooked (without the
 * factor if it is missing).
 */
export function foodCarbsLine(
  food: Pick<Food, 'state' | 'carbs_per_100g' | 'cooking_factor'>,
): string {
  const carbs = `HC ${formatCarbs(food.carbs_per_100g)} g/100 g`
  if (food.state === 'as_eaten') return carbs
  if (food.cooking_factor === null) return `${carbs} crudo`
  return `${carbs} crudo, factor ${formatCookingFactor(food.cooking_factor)}`
}

function unitsText(quantity: number): string {
  return `${formatUserNumber(quantity)} ${quantity === 1 ? 'unidad' : 'unidades'}`
}

/**
 * The calculation of a valid item, from the typed quantity to its carbs:
 * - eaten cooked: "78,0 ÷ 2,60 = 30,0 g/100 g cocido" and
 *   "250 g cocido × 30,0 ÷ 100 = 75,0 g HC";
 * - in units: "0,5 unidades × 45 g = 22,5 g" and
 *   "22,5 g × 58,0 ÷ 100 = 13,1 g HC";
 * - in grams: "120 g × 20,2 ÷ 100 = 24,2 g HC".
 */
export function itemCalculationLines(
  input: MealItemInput,
  result: Pick<ItemSuccess, 'grams' | 'effectiveCarbsPer100g' | 'carbsG'>,
): string[] {
  const effective = formatCarbs(result.effectiveCarbsPer100g)
  const carbs = `${formatCarbs(result.carbsG)} g HC`
  const grams = formatGrams(result.grams)

  // In a valid raw_cooked item the raw carbs and the factor are loaded; the
  // null checks only narrow the types.
  if (
    input.foodState === 'raw_cooked' &&
    input.carbsPer100g !== null &&
    input.cookingFactor !== null
  ) {
    return [
      `${formatCarbs(input.carbsPer100g)} ÷ ${formatCookingFactor(input.cookingFactor)} = ${effective} g/100 g cocido`,
      `${grams} g cocido × ${effective} ÷ 100 = ${carbs}`,
    ]
  }

  const lines: string[] = []
  if (
    input.quantityMode === 'units' &&
    input.quantity !== null &&
    input.unitWeightG !== null
  ) {
    lines.push(
      `${unitsText(input.quantity)} × ${formatGrams(input.unitWeightG)} g = ${grams} g`,
    )
  }
  lines.push(`${grams} g × ${effective} ÷ 100 = ${carbs}`)
  return lines
}

/**
 * The lines of a saved item (the history detail, spec §6.7): the same lines
 * the meal screen showed, from the values saved in the record and without
 * calculating again. The quantity is the saved units in units mode,
 * otherwise the saved grams (in grams mode they are the typed quantity).
 */
export function savedItemLines(item: SavedMealItem): string[] {
  const input: MealItemInput = {
    foodState: item.food_state,
    carbsPer100g: item.carbs_per_100g,
    cookingFactor: item.cooking_factor,
    unitWeightG: item.unit_weight_g,
    quantityMode: item.quantity_mode,
    quantity: item.quantity_mode === 'units' ? item.units : item.grams,
  }
  return [
    foodCarbsLine({
      state: item.food_state,
      carbs_per_100g: item.carbs_per_100g,
      cooking_factor: item.cooking_factor,
    }),
    ...itemCalculationLines(input, {
      grams: item.grams,
      effectiveCarbsPer100g: item.effective_carbs_per_100g,
      carbsG: item.carbs_g,
    }),
  ]
}

/** "HC total = 128,2 g". */
export function totalCarbsLine(totalCarbsG: number): string {
  return `HC total = ${formatCarbs(totalCarbsG)} g`
}

/** "Dosis = 128,2 ÷ 15 = 8,55 U", with the ratio exact. */
export function doseLine(
  totalCarbsG: number,
  carbRatioGPerUnit: number,
  doseUnits: number,
): string {
  return `Dosis = ${formatCarbs(totalCarbsG)} ÷ ${formatUserNumber(carbRatioGPerUnit)} = ${formatDose(doseUnits)} U`
}
