import {
  CALC_VERSION,
  cookedGramsPer100gRaw,
  formatDose,
  formatDoseCompact,
  formatGrams,
  formatUserNumber,
  parseNonNegativeUserNumber,
  parsePositiveUserNumber,
  parseUserNumber,
  type DoseSettings,
  type ItemResult,
  type ItemSuccess,
  type MealItemInput,
  type MealResult,
  type MealSuccess,
  type NonNegativeNumberResult,
  type PositiveNumberError,
} from '../../domain/dose/index.ts'
import type {
  MealItemFoodError,
  MealProblem,
  MealSaveWarning,
} from '../../lib/errors.ts'
import type { Food } from '../../lib/foods.ts'
import type { Settings } from '../../lib/settings.ts'
import { eatenAtFromInput } from './eatenAt.ts'
import { tableFoodCopy } from './tableFoods.ts'
import type {
  MealFood,
  MealItemDraft,
  NewMealItem,
  NewMealRecord,
} from './types.ts'

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
export function newItemDraft(key: number, food: MealFood): MealItemDraft {
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

/**
 * The applied dose that is saved (spec §6.6). While the user has not edited
 * the field (`text` is null), it follows the calculated dose, exactly (not
 * the rounded value the field shows). Once edited, it is the typed text,
 * which has to be a number >= 0.
 */
export function appliedDose(
  text: string | null,
  calculatedDose: number,
): NonNegativeNumberResult {
  if (text === null) return { value: calculatedDose }
  return parseNonNegativeUserNumber(text)
}

/**
 * What the applied dose field shows: the typed text once edited; while it
 * follows the calculated dose, that dose without trailing zeros ("8,55",
 * "7", not "7,00"; formatDoseCompact), or "" if there is no valid dose.
 */
export function appliedDoseFieldText(
  text: string | null,
  result: MealResult,
): string {
  if (text !== null) return text
  return result.ok ? formatDoseCompact(result.doseUnits) : ''
}

/**
 * Whether the applied dose field holds exactly `units` (a shortcut of
 * appliedDoseShortcuts): only a typed text, never while it follows the
 * calculated dose, so no shortcut starts chosen (spec §6.6, §14 #71).
 */
export function isAppliedDoseShortcut(
  text: string | null,
  units: number,
): boolean {
  return text !== null && parseUserNumber(text) === units
}

/**
 * The first thing to fix when "Guardar comida" finds errors (spec §6.6), in
 * the order of the screen: each item (an error of its food, then its
 * quantity), the applied dose and the date; the meal itself (the total or
 * the dose, shown in the dose display) last. With the problem, the key of
 * its item, if it is one. null if nothing blocks saving.
 */
export function firstMealProblem(
  items: readonly MealItemDraft[],
  result: MealResult,
  appliedDoseText: string | null,
  eatenAtText: string | null,
): { problem: MealProblem; itemKey: number | null } | null {
  for (const [index, item] of items.entries()) {
    const calc = result.items[index]
    const foodName = item.food.name
    if (calc !== undefined && foodErrors(calc).length > 0) {
      return { problem: { code: 'FOOD', foodName }, itemKey: item.key }
    }
    const error = quantityError(item.quantityText, calc)
    if (error !== null) {
      return {
        problem: { code: 'QUANTITY', foodName, error },
        itemKey: item.key,
      }
    }
  }
  if (appliedDoseText !== null) {
    const applied = parseNonNegativeUserNumber(appliedDoseText)
    if ('error' in applied) {
      return {
        problem: { code: 'APPLIED_DOSE', error: applied.error },
        itemKey: null,
      }
    }
  }
  if (eatenAtText !== null && eatenAtFromInput(eatenAtText) === null) {
    return {
      problem: { code: 'EATEN_AT', empty: eatenAtText.trim() === '' },
      itemKey: null,
    }
  }
  if (!result.ok) return { problem: { code: 'MEAL' }, itemKey: null }
  return null
}

/** An item just removed from the meal, kept to undo it. */
export type RemovedItem = { item: MealItemDraft; index: number }

/**
 * The items without the one with `key`, and that one with its place, to
 * undo it (spec §6.6: removing asks for nothing, and "Deshacer" brings it
 * back). `removed` is null if no item has that key.
 */
export function removeItem(
  items: readonly MealItemDraft[],
  key: number,
): { items: MealItemDraft[]; removed: RemovedItem | null } {
  const index = items.findIndex((item) => item.key === key)
  const item = items[index]
  if (item === undefined) return { items: [...items], removed: null }
  return {
    items: items.filter((other) => other !== item),
    removed: { item, index },
  }
}

/**
 * The items with a removed one back in its place, as it was (its food and
 * what was typed). If items were removed in the meantime, it goes at the
 * end at most; if its key is already there (it was restored), nothing
 * changes.
 */
export function restoreItem(
  items: readonly MealItemDraft[],
  removed: RemovedItem,
): MealItemDraft[] {
  if (items.some((item) => item.key === removed.item.key)) return [...items]
  const index = Math.min(removed.index, items.length)
  return [...items.slice(0, index), removed.item, ...items.slice(index)]
}

/**
 * Each item with its calculation. calculateMeal returns one result per item,
 * in the same order: a missing one is a programming error.
 */
function withResults(
  items: readonly MealItemDraft[],
  result: MealSuccess,
): { item: MealItemDraft; calc: ItemSuccess }[] {
  if (result.items.length !== items.length) {
    throw new Error('The meal result does not match its items')
  }
  return items.map((item, index) => {
    const calc = result.items[index]
    if (calc === undefined) {
      throw new Error('The meal result does not match its items')
    }
    return { item, calc }
  })
}

/**
 * The warnings of one item (spec §8.5), with their values formatted, in the
 * order calculateMeal gives them. They are shown under its quantity as soon
 * as the calculation gives them, without waiting for the blur (they do not
 * block), and asked for again before saving. An item that is not valid has
 * none; a valid one has them even if another item of the meal is not valid
 * (calculateMeal keeps each item's result). The comparison with the alerts
 * is calculateMeal's: this only formats.
 */
export function itemWarnings(
  item: MealItemDraft,
  calc: ItemResult | undefined,
  settings: Settings,
): MealSaveWarning[] {
  if (calc === undefined || !calc.ok) return []
  const warnings: MealSaveWarning[] = []
  for (const code of calc.warnings) {
    if (code === 'ITEM_GRAMS_ABOVE_THRESHOLD') {
      warnings.push({
        code,
        foodName: item.food.name,
        grams: formatGrams(calc.grams),
        threshold: formatUserNumber(settings.max_item_grams_warning),
      })
    } else if (item.food.cooking_factor !== null) {
      // COOKING_FACTOR_UNUSUAL only comes with a factor. It is said as how
      // much 100 g raw yield (null if that cannot be shown).
      const cookedGrams = cookedGramsPer100gRaw(item.food.cooking_factor)
      warnings.push({
        code,
        foodName: item.food.name,
        cookedGrams: cookedGrams === null ? null : formatGrams(cookedGrams),
      })
    }
  }
  return warnings
}

/**
 * The dose warning (spec §8.5), or null: only with a valid meal whose
 * calculated dose is above the alert, as calculateMeal evaluates it (the
 * applied dose does not warn). Shown in the dose display as soon as it
 * appears, and asked for again before saving.
 */
export function doseWarning(
  result: MealResult,
  settings: Settings,
): MealSaveWarning | null {
  // DOSE_ABOVE_THRESHOLD only comes with a threshold.
  if (
    !result.ok ||
    !result.warnings.includes('DOSE_ABOVE_THRESHOLD') ||
    settings.max_dose_warning_units === null
  ) {
    return null
  }
  return {
    code: 'DOSE_ABOVE_THRESHOLD',
    dose: formatDose(result.doseUnits),
    threshold: formatUserNumber(settings.max_dose_warning_units),
  }
}

/**
 * The warnings to confirm before saving (spec §8.5), with their values
 * formatted: the items' ones in the order of the items (itemWarnings), then
 * the dose one (doseWarning).
 */
export function saveWarnings(
  items: readonly MealItemDraft[],
  result: MealSuccess,
  settings: Settings,
): MealSaveWarning[] {
  const warnings = withResults(items, result).flatMap(({ item, calc }) =>
    itemWarnings(item, calc, settings),
  )
  const dose = doseWarning(result, settings)
  return dose === null ? warnings : [...warnings, dose]
}

function toNewMealItem(
  item: MealItemDraft,
  calc: ItemSuccess,
  position: number,
): NewMealItem {
  const { food } = item
  const inUnits = item.quantityMode === 'units'
  const units = inUnits ? toMealItemInput(item).quantity : null
  if (inUnits && units === null) {
    throw new Error('A calculated item in units has no quantity')
  }
  return {
    // A food of the reference table not copied yet is resolved by
    // createMeal (spec §6.2).
    food: food.id !== null ? { id: food.id } : { copy: tableFoodCopy(food) },
    position,
    food_name: food.name,
    food_brand: food.brand,
    food_source: food.source,
    food_state: food.state,
    quantity_mode: item.quantityMode,
    units,
    unit_weight_g: inUnits ? food.unit_weight_g : null,
    grams: calc.grams,
    carbs_per_100g: food.carbs_per_100g,
    cooking_factor: food.state === 'raw_cooked' ? food.cooking_factor : null,
    effective_carbs_per_100g: calc.effectiveCarbsPer100g,
    carbs_g: calc.carbsG,
  }
}

/**
 * The meal to save (spec §6.7, §7.1): a copy of the values used and of the
 * calculation result, without math of its own and without rounding. The
 * ratio comes from the same settings that produced `result`. Each item goes
 * at the position of its index, from 0.
 */
export function toNewMealRecord(
  items: readonly MealItemDraft[],
  result: MealSuccess,
  settings: Settings,
  appliedDoseUnits: number,
  eatenAt: string,
): NewMealRecord {
  return {
    meal: {
      eaten_at: eatenAt,
      carb_ratio_g_per_unit: settings.carb_ratio_g_per_unit,
      total_carbs_g: result.totalCarbsG,
      calculated_dose_units: result.doseUnits,
      applied_dose_units: appliedDoseUnits,
      calc_version: CALC_VERSION,
    },
    items: withResults(items, result).map(({ item, calc }, index) =>
      toNewMealItem(item, calc, index),
    ),
  }
}
