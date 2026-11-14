import { MAX_CARBS_PER_100G, isValidCarbsPer100g } from './carbsPer100g.ts'
import { isCookingFactorUnusual } from './cookingFactor.ts'
import type {
  DoseSettings,
  ItemErrorCode,
  ItemResult,
  ItemSuccess,
  ItemWarningCode,
  MealErrorCode,
  MealItemInput,
  MealResult,
  MealWarningCode,
} from './types.ts'

/**
 * Version of the calculation rules. It is stored with every meal record.
 * Bump it whenever the calculation behavior changes.
 */
export const CALC_VERSION = '1'

function positiveOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null
}

function carbsPer100gOrNull(value: number | null): number | null {
  return value !== null && isValidCarbsPer100g(value) ? value : null
}

function calculateItem(
  item: MealItemInput,
  maxItemGramsWarning: number,
): ItemResult {
  const errors: ItemErrorCode[] = []

  const quantity = positiveOrNull(item.quantity)
  if (quantity === null) errors.push('INVALID_QUANTITY')

  const carbsPer100g = carbsPer100gOrNull(item.carbsPer100g)
  if (carbsPer100g === null) errors.push('INVALID_CARBS')

  // An `as_eaten` value is already in the state it is eaten, so any cooking
  // factor it carries is ignored.
  let cookingFactor: number | null = null
  if (item.foodState === 'raw_cooked') {
    if (item.cookingFactor === null) {
      errors.push('MISSING_COOKING_FACTOR')
    } else {
      cookingFactor = positiveOrNull(item.cookingFactor)
      if (cookingFactor === null) errors.push('INVALID_COOKING_FACTOR')
    }
  }

  // Units are rejected for `raw_cooked` foods: a unit weight comes from the
  // label (raw product), but the grams of these foods are always cooked
  // grams. Mixing both would undercount carbs by the cooking factor.
  let unitWeightG: number | null = null
  if (item.quantityMode === 'units') {
    if (item.foodState === 'raw_cooked') {
      errors.push('UNITS_NOT_ALLOWED_FOR_RAW_COOKED')
    } else {
      unitWeightG = positiveOrNull(item.unitWeightG)
      if (unitWeightG === null) errors.push('MISSING_UNIT_WEIGHT')
    }
  }

  let effectiveCarbsPer100g: number | null = null
  if (carbsPer100g !== null) {
    if (item.foodState === 'as_eaten') {
      effectiveCarbsPer100g = carbsPer100g
    } else if (cookingFactor !== null) {
      effectiveCarbsPer100g = carbsPer100g / cookingFactor
    }
  }
  if (
    effectiveCarbsPer100g !== null &&
    effectiveCarbsPer100g > MAX_CARBS_PER_100G
  ) {
    errors.push('EFFECTIVE_CARBS_OVER_100')
  }

  let grams: number | null = null
  if (quantity !== null) {
    if (item.quantityMode === 'grams') {
      grams = quantity
    } else if (unitWeightG !== null) {
      grams = quantity * unitWeightG
    }
  }

  // Every null above already pushed an error; the null checks only narrow
  // the types.
  if (errors.length > 0 || effectiveCarbsPer100g === null || grams === null) {
    return { ok: false, errors }
  }

  const warnings: ItemWarningCode[] = []
  if (grams > maxItemGramsWarning) {
    warnings.push('ITEM_GRAMS_ABOVE_THRESHOLD')
  }
  if (cookingFactor !== null && isCookingFactorUnusual(cookingFactor)) {
    warnings.push('COOKING_FACTOR_UNUSUAL')
  }

  return {
    ok: true,
    grams,
    effectiveCarbsPer100g,
    carbsG: (grams * effectiveCarbsPer100g) / 100,
    warnings,
  }
}

/**
 * Calculates the carbs of each item, the total carbs and the bolus dose of a
 * meal (spec §8.2). Never throws for invalid input: problems come back as
 * error codes. Never rounds: round only for display (see format.ts).
 */
export function calculateMeal(
  items: readonly MealItemInput[],
  settings: DoseSettings,
): MealResult {
  const errors: MealErrorCode[] = []
  if (items.length === 0) errors.push('EMPTY_MEAL')

  const ratio = positiveOrNull(settings.carbRatioGPerUnit)
  if (ratio === null) errors.push('INVALID_RATIO')

  const results = items.map((item) =>
    calculateItem(item, settings.maxItemGramsWarning),
  )
  const successes = results.filter((result): result is ItemSuccess => result.ok)

  if (
    ratio === null ||
    errors.length > 0 ||
    successes.length < results.length
  ) {
    return { ok: false, items: results, errors }
  }

  const totalCarbsG = successes.reduce((sum, item) => sum + item.carbsG, 0)
  const doseUnits = totalCarbsG / ratio

  const warnings: MealWarningCode[] = []
  if (
    settings.maxDoseWarningUnits !== null &&
    doseUnits > settings.maxDoseWarningUnits
  ) {
    warnings.push('DOSE_ABOVE_THRESHOLD')
  }

  return { ok: true, items: successes, totalCarbsG, doseUnits, warnings }
}
