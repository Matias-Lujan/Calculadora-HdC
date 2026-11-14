import {
  parsePositiveUserNumber,
  parseUserNumber,
  type DoseSettings,
  type ItemResult,
  type MealItemInput,
  type PositiveNumberError,
} from '../../domain/dose/index.ts'
import type { MealItemFoodError } from '../../lib/errors.ts'
import type { Food } from '../../lib/foods.ts'
import type { Settings } from '../../lib/settings.ts'
import type { MealItemDraft } from './types.ts'

// Pure logic of the meal form (spec §6.6). It does no math of its own: the
// numbers go through src/domain/dose.

/**
 * Whether the quantity of a food can be entered in units: only `as_eaten`
 * foods with a weight per unit (spec §6.6; a `raw_cooked` food is always
 * entered in cooked grams).
 */
export function canUseUnits(
  food: Pick<Food, 'state' | 'unit_weight_g'>,
): boolean {
  return food.state === 'as_eaten' && food.unit_weight_g !== null
}

/**
 * The item added when a food is picked: in units if the food allows it,
 * otherwise in grams, with the quantity empty.
 */
export function newItemDraft(key: number, food: Food): MealItemDraft {
  return {
    key,
    food,
    quantityMode: canUseUnits(food) ? 'units' : 'grams',
    quantityText: '',
  }
}

/**
 * What the calculation receives for an item. The quantity is the typed text
 * as parseUserNumber reads it (null if empty or not a number); its range
 * (> 0) is checked by calculateMeal (INVALID_QUANTITY).
 */
export function toMealItemInput(item: MealItemDraft): MealItemInput {
  return {
    foodState: item.food.state,
    carbsPer100g: item.food.carbs_per_100g,
    cookingFactor: item.food.cooking_factor,
    unitWeightG: item.food.unit_weight_g,
    quantityMode: item.quantityMode,
    quantity: parseUserNumber(item.quantityText),
  }
}

export function toDoseSettings(settings: Settings): DoseSettings {
  return {
    carbRatioGPerUnit: settings.carb_ratio_g_per_unit,
    maxDoseWarningUnits: settings.max_dose_warning_units,
    maxItemGramsWarning: settings.max_item_grams_warning,
  }
}

/**
 * The error the quantity field shows on blur, or null if it is valid. The
 * text is checked with parsePositiveUserNumber; if it passes but the
 * calculation of the item still reports INVALID_QUANTITY (a number so big
 * that the item overflows, spec §8.4), the field shows INVALID_NUMBER, so a
 * blocked item never goes without an error on its field.
 */
export function quantityError(
  text: string,
  result: ItemResult | undefined,
): PositiveNumberError | null {
  const parsed = parsePositiveUserNumber(text)
  if ('error' in parsed) return parsed.error
  if (
    result !== undefined &&
    !result.ok &&
    result.errors.includes('INVALID_QUANTITY')
  ) {
    return 'INVALID_NUMBER'
  }
  return null
}

/**
 * The errors of an item that come from its food (shown right away), without
 * INVALID_QUANTITY, which the quantity field shows on blur.
 */
export function foodErrors(result: ItemResult): MealItemFoodError[] {
  if (result.ok) return []
  return result.errors.filter(
    (code): code is MealItemFoodError => code !== 'INVALID_QUANTITY',
  )
}
