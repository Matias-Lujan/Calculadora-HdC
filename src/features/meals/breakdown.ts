import {
  cookedGramsPer100gRaw,
  formatCarbs,
  formatDose,
  formatGrams,
  formatUserNumber,
  withUnitsWord,
  type ItemSuccess,
  type MealItemInput,
} from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'
import { cookedPer100gText } from '../../lib/foodText.ts'
import type { SavedMealItem } from './types.ts'

// The texts of the meal breakdown (spec §8.3). They only format: every
// number comes from the food, the typed input or calculateMeal's result
// (in the history, from the values saved in the record).
// Carbs with formatCarbs, grams (and how much 100 g raw yield) with
// formatGrams, dose with formatDose; typed units and the ratio exact, with
// formatUserNumber.
// What is always in sight (the carbs of an item, the total and the dose)
// and the calculation, which goes inside "Ver la cuenta" (spec §6.6,
// §14 #52).

/** The carbs of a valid item, in sight: "75,0 g de HC". */
export function itemCarbsText(carbsG: number): string {
  return `${formatCarbs(carbsG)} g de HC`
}

/** The meal total, in sight: "HC total 128,2 g". */
export function totalCarbsText(totalCarbsG: number): string {
  return `HC total ${formatCarbs(totalCarbsG)} g`
}

/** The meal total in the dose display, under "Hidratos": "128,2 g". */
export function displayCarbsText(totalCarbsG: number): string {
  return `${formatCarbs(totalCarbsG)} g`
}

/** The calculated dose, in sight: "Dosis 8,55 unidades". */
export function doseText(doseUnits: number): string {
  return `Dosis ${withUnitsWord(formatDose(doseUnits))}`
}

/**
 * The ratio the dose is calculated with, always in sight in the dose
 * display: "Ratio: 1 unidad cada 15 g de HC", with the ratio exact.
 */
export function ratioText(carbRatioGPerUnit: number): string {
  return `Ratio: 1 unidad cada ${formatUserNumber(carbRatioGPerUnit)} g de HC`
}

/**
 * The carbs of the food: "20,2 g de HC cada 100 g", or "78,0 g de HC cada
 * 100 g en crudo" for a food eaten cooked.
 */
export function foodCarbsLine(
  food: Pick<Food, 'state' | 'carbs_per_100g'>,
): string {
  const carbs = `${formatCarbs(food.carbs_per_100g)} g de HC cada 100 g`
  return food.state === 'as_eaten' ? carbs : `${carbs} en crudo`
}

/**
 * How much a food eaten cooked yields, "100 g crudo rinden 260 g cocido".
 * null for an as_eaten food (its factor is ignored), without a factor, or
 * with one whose yield cannot be shown.
 */
export function foodYieldLine(
  food: Pick<Food, 'state' | 'cooking_factor'>,
): string | null {
  if (food.state === 'as_eaten' || food.cooking_factor === null) return null
  return cookedPer100gText(food.cooking_factor)
}

/** The lines of the food: its carbs and, if there is one, its yield. */
export function foodLines(
  food: Pick<Food, 'state' | 'carbs_per_100g' | 'cooking_factor'>,
): string[] {
  const yieldText = foodYieldLine(food)
  return yieldText === null
    ? [foodCarbsLine(food)]
    : [foodCarbsLine(food), yieldText]
}

/**
 * The calculation of a valid item, from the typed quantity to its carbs:
 * - eaten cooked: "Cocido: 78,0 × 100 ÷ 260 = 30,0 g de HC cada 100 g" and
 *   "250 g cocido × 30,0 ÷ 100 = 75,0 g HC" (if the yield cannot be shown,
 *   "Cocido: 30,0 g de HC cada 100 g", without the calculation);
 * - in units: "0,5 × alfajor de 45 g = 22,5 g" (with the name of the unit,
 *   `unitLabel`, or "unidad" without one: "unidades" is kept for insulin)
 *   and "22,5 g × 58,0 ÷ 100 = 13,1 g HC";
 * - in grams: "120 g × 20,2 ÷ 100 = 24,2 g HC".
 */
export function itemCalculationLines(
  input: MealItemInput,
  result: Pick<ItemSuccess, 'grams' | 'effectiveCarbsPer100g' | 'carbsG'>,
  unitLabel: string | null = null,
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
    const cookedGrams = cookedGramsPer100gRaw(input.cookingFactor)
    const cooked =
      cookedGrams === null
        ? `Cocido: ${effective} g de HC cada 100 g`
        : `Cocido: ${formatCarbs(input.carbsPer100g)} × 100 ÷ ${formatGrams(cookedGrams)} = ${effective} g de HC cada 100 g`
    return [cooked, `${grams} g cocido × ${effective} ÷ 100 = ${carbs}`]
  }

  const lines: string[] = []
  if (
    input.quantityMode === 'units' &&
    input.quantity !== null &&
    input.unitWeightG !== null
  ) {
    lines.push(
      `${formatUserNumber(input.quantity)} × ${unitLabel ?? 'unidad'} de ${formatGrams(input.unitWeightG)} g = ${grams} g`,
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
 * The record does not keep the name of the unit: "0,5 × unidad de 45 g".
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
    ...foodLines({
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

/**
 * How much of a saved item was eaten, in sight in the history detail
 * (UX-12), from the saved values: "250 g cocidos" (a food eaten cooked),
 * "1 × unidad de 50 g" (in units, with the units exact; the record does not
 * keep the name of the unit) or "120 g".
 */
export function savedItemQuantityText(
  item: Pick<
    SavedMealItem,
    'food_state' | 'quantity_mode' | 'units' | 'unit_weight_g' | 'grams'
  >,
): string {
  if (
    item.quantity_mode === 'units' &&
    item.units !== null &&
    item.unit_weight_g !== null
  ) {
    return `${formatUserNumber(item.units)} × unidad de ${formatGrams(item.unit_weight_g)} g`
  }
  const grams = `${formatGrams(item.grams)} g`
  return item.food_state === 'raw_cooked' ? `${grams} cocidos` : grams
}

/**
 * The small line of the summary of a saved meal (UX-12): "Calculada: 5,39
 * unidades · Ratio: 1 unidad cada 15 g de HC", with the ratio saved in the
 * record.
 */
export function savedDoseNoteText(
  calculatedDoseUnits: number,
  carbRatioGPerUnit: number,
): string {
  return `Calculada: ${withUnitsWord(formatDose(calculatedDoseUnits))} · ${ratioText(carbRatioGPerUnit)}`
}

/**
 * The calculation of the meal, under "Ver la cuenta" of the total. There is
 * no line with the sum of the items: each addend is rounded on its own and
 * the sum would not always add up to the rounded total (spec §14 #52).
 * "Dosis = 128,2 ÷ 15 = 8,55 unidades", with the ratio exact. */
export function doseLine(
  totalCarbsG: number,
  carbRatioGPerUnit: number,
  doseUnits: number,
): string {
  return `Dosis = ${formatCarbs(totalCarbsG)} ÷ ${formatUserNumber(carbRatioGPerUnit)} = ${withUnitsWord(formatDose(doseUnits))}`
}
