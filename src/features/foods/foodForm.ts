import {
  cookedGramsPer100gRaw,
  cookingFactorFromWeights,
  formatGrams,
  formatUserNumber,
  isCookingFactorUnusual,
  normalizeForDisplay,
  parseCarbsPer100g,
  parsePositiveUserNumber,
} from '../../domain/dose/index.ts'
import {
  cookingFactorUnusualMessage,
  type FoodFieldError,
} from '../../lib/errors.ts'
import type { Food } from '../../lib/foods.ts'
import { cookedPer100gText } from '../../lib/foodText.ts'
import type { FoodFormValues, NewFood } from './types.ts'

// Pure logic of the food form (create and edit, spec §6.3–§6.5). It does no
// math of its own: numbers go through src/domain/dose.

/** What the form fields hold, as typed. */
export type FoodFormTexts = {
  name: string
  brand: string
  state: Food['state'] | null
  carbsPer100g: string
  rawWeight: string
  cookedWeight: string
  unitWeight: string
  unitLabel: string
  notes: string
}

/**
 * The error of each field, by field name. `measuredFactor` is the error of
 * the cooking factor measured with both weights.
 */
export type FoodFormErrors = Partial<
  Record<keyof FoodFormTexts | 'measuredFactor', FoodFieldError>
>

/**
 * The fields every food form has besides the carbs: the manual form and
 * the label confirmation (labelForm.ts) share them.
 */
export type CommonFoodTexts = Omit<FoodFormTexts, 'carbsPer100g'>

export type CommonFoodErrors = Partial<
  Record<keyof CommonFoodTexts | 'measuredFactor', FoodFieldError>
>

export type FoodFormResult = {
  /** null when there is any error. */
  values: FoodFormValues | null
  errors: FoodFormErrors
}

/**
 * A saved number as the field starts with it: without binary noise (a copy
 * of the table holds 27.770000000000003 and the field shows "27,77", spec
 * §14 #53). While the field still holds this text, saving keeps the exact
 * saved value (see validateFoodForm).
 */
function numberText(value: number | null): string {
  return value === null ? '' : formatUserNumber(normalizeForDisplay(value))
}

/**
 * The texts the form starts with: empty for a new food (no state chosen),
 * or the food's values when editing, at 15 significant digits. The weights
 * always start empty: empty means "the saved cooking factor does not
 * change" (§6.4).
 */
export function initialFoodFormTexts(food?: Food): FoodFormTexts {
  if (food === undefined) {
    return {
      name: '',
      brand: '',
      state: null,
      carbsPer100g: '',
      rawWeight: '',
      cookedWeight: '',
      unitWeight: '',
      unitLabel: '',
      notes: '',
    }
  }
  return {
    name: food.name,
    brand: food.brand ?? '',
    state: food.state,
    carbsPer100g: numberText(food.carbs_per_100g),
    rawWeight: '',
    cookedWeight: '',
    unitWeight: numberText(food.unit_weight_g),
    unitLabel: food.unit_label ?? '',
    notes: food.notes ?? '',
  }
}

/** Trimmed text, or null when it is empty. */
function optionalText(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The live line of the weights (spec §6.4), "Con estos pesos, 100 g crudo
 * rinden 261,1 g cocido.". null when a weight is missing or not valid, or
 * the quotient is not computable.
 */
export function yieldLine(
  texts: Pick<FoodFormTexts, 'rawWeight' | 'cookedWeight'>,
): string | null {
  const raw = parsePositiveUserNumber(texts.rawWeight)
  const cooked = parsePositiveUserNumber(texts.cookedWeight)
  if ('error' in raw || 'error' in cooked) return null
  const factor = cookingFactorFromWeights(raw.value, cooked.value)
  if (factor === null) return null
  const text = cookedPer100gText(factor)
  return text === null ? null : `Con estos pesos, ${text}.`
}

/**
 * The live line of one unit, "1 alfajor = 45 g" ("1 unidad = 45 g" without
 * a name), with the weight exact. null while the weight is not valid.
 */
export function unitLine(
  texts: Pick<FoodFormTexts, 'unitWeight' | 'unitLabel'>,
): string | null {
  const weight = parsePositiveUserNumber(texts.unitWeight)
  if ('error' in weight) return null
  const label = optionalText(texts.unitLabel) ?? 'unidad'
  return `1 ${label} = ${formatUserNumber(weight.value)} g`
}

/** The label of the carbs field: "en crudo" when the food is cooked. */
export function carbsLabel(state: Food['state'] | null): string {
  return state === 'raw_cooked' ? 'HC cada 100 g, en crudo' : 'HC cada 100 g'
}

/**
 * Whether "Más opciones" starts open: closed for a new food; when editing,
 * open if something inside it is loaded (brand, unit or note) or the food
 * is cooked (how much it yields is inside).
 */
export function startsWithMoreOptionsOpen(food?: Food): boolean {
  if (food === undefined) return false
  return (
    food.brand !== null ||
    food.unit_weight_g !== null ||
    food.unit_label !== null ||
    food.notes !== null ||
    food.state === 'raw_cooked'
  )
}

/** Whether a field inside "Más opciones" has an error. */
export function hasMoreOptionsErrors(errors: CommonFoodErrors): boolean {
  return (
    errors.unitWeight !== undefined ||
    errors.rawWeight !== undefined ||
    errors.cookedWeight !== undefined ||
    errors.measuredFactor !== undefined
  )
}

/**
 * Cooking factor of a raw_cooked food. Both weights empty keep the saved
 * factor as it is (null for a new food: a valid "not loaded yet").
 */
function validateCookingFactor(
  texts: CommonFoodTexts,
  savedCookingFactor: number | null,
  errors: CommonFoodErrors,
): number | null {
  const rawEmpty = texts.rawWeight.trim() === ''
  const cookedEmpty = texts.cookedWeight.trim() === ''
  if (rawEmpty && cookedEmpty) return savedCookingFactor

  const raw = parsePositiveUserNumber(texts.rawWeight)
  const cooked = parsePositiveUserNumber(texts.cookedWeight)
  if ('error' in raw) errors.rawWeight = raw.error
  if ('error' in cooked) errors.cookedWeight = cooked.error
  if ('error' in raw || 'error' in cooked) return null

  // A factor whose yield cannot be shown (it overflows when moved to grams
  // per 100 g) is not computable either: the form could not say it.
  const factor = cookingFactorFromWeights(raw.value, cooked.value)
  if (factor === null || cookedGramsPer100gRaw(factor) === null) {
    errors.measuredFactor = 'FACTOR_NOT_COMPUTABLE'
    return null
  }
  return factor
}

/**
 * The exact saved value when the field still holds the text it started with
 * (nothing is rounded on save, spec §14 #53); otherwise what was typed.
 */
function untouchedOr(
  text: string,
  saved: number | null | undefined,
  typed: number,
): number {
  if (saved === null || saved === undefined) return typed
  return text === numberText(saved) ? saved : typed
}

/** Weight and name of one unit of an as_eaten food (both optional). */
function validateUnit(
  texts: CommonFoodTexts,
  savedUnitWeight: number | null | undefined,
  errors: CommonFoodErrors,
): { unit_weight_g: number | null; unit_label: string | null } {
  const unitLabel = optionalText(texts.unitLabel)
  if (texts.unitWeight.trim() === '') {
    if (unitLabel !== null) errors.unitWeight = 'UNIT_WEIGHT_REQUIRED'
    return { unit_weight_g: null, unit_label: null }
  }
  const result = parsePositiveUserNumber(texts.unitWeight)
  if ('error' in result) {
    errors.unitWeight = result.error
    return { unit_weight_g: null, unit_label: null }
  }
  return {
    unit_weight_g: untouchedOr(texts.unitWeight, savedUnitWeight, result.value),
    unit_label: unitLabel,
  }
}

/**
 * Validates every field but the carbs (name, "¿Se cocina antes de comer?",
 * how much it yields, the unit, brand and note), adds their errors to
 * `errors` and returns their values, or null if any of them has an error.
 * `savedCookingFactor` is the factor of the food being edited (null for a
 * new food): it is kept when both weights are empty. Hidden fields (the
 * weights of an as_eaten food, the unit of a raw_cooked one) are neither
 * validated nor saved, even if they still hold text. `savedUnitWeight` is
 * the saved unit weight of the food being edited: while the field still
 * holds the text it started with, that exact value is saved (spec §14 #53).
 */
export function validateCommonFields(
  texts: CommonFoodTexts,
  savedCookingFactor: number | null,
  savedUnitWeight: number | null | undefined,
  errors: CommonFoodErrors,
): Omit<FoodFormValues, 'carbs_per_100g'> | null {
  const own: CommonFoodErrors = {}

  const name = texts.name.trim()
  if (name === '') own.name = 'NAME_REQUIRED'

  let cookingFactor: number | null = null
  let unit: { unit_weight_g: number | null; unit_label: string | null } = {
    unit_weight_g: null,
    unit_label: null,
  }
  if (texts.state === null) {
    own.state = 'STATE_REQUIRED'
  } else if (texts.state === 'raw_cooked') {
    cookingFactor = validateCookingFactor(texts, savedCookingFactor, own)
  } else {
    unit = validateUnit(texts, savedUnitWeight, own)
  }

  Object.assign(errors, own)
  if (Object.keys(own).length > 0 || texts.state === null) return null

  return {
    name,
    brand: optionalText(texts.brand),
    state: texts.state,
    cooking_factor: cookingFactor,
    unit_weight_g: unit.unit_weight_g,
    unit_label: unit.unit_label,
    notes: optionalText(texts.notes),
  }
}

/**
 * Validates the form and returns what to save, or the error of each field.
 * The fields besides the carbs go through validateCommonFields (with
 * `savedCookingFactor` and the saved unit weight). `savedFood` holds the
 * saved carbs and unit weight of the food being edited: a field that still
 * holds the text it started with saves that exact value, not the parsed
 * text (spec §14 #53).
 */
export function validateFoodForm(
  texts: FoodFormTexts,
  savedCookingFactor: number | null,
  savedFood?: Pick<Food, 'carbs_per_100g' | 'unit_weight_g'>,
): FoodFormResult {
  const errors: FoodFormErrors = {}

  const carbs = parseCarbsPer100g(texts.carbsPer100g)
  if ('error' in carbs) errors.carbsPer100g = carbs.error

  const common = validateCommonFields(
    texts,
    savedCookingFactor,
    savedFood?.unit_weight_g,
    errors,
  )

  if (common === null || 'error' in carbs) return { values: null, errors }

  return {
    values: {
      ...common,
      carbs_per_100g: untouchedOr(
        texts.carbsPer100g,
        savedFood?.carbs_per_100g,
        carbs.value,
      ),
    },
    errors,
  }
}

/**
 * Whether saving needs an extra confirmation: a cooking factor outside the
 * usual 1–4 range (spec §6.4).
 */
export function needsFactorConfirmation(values: FoodFormValues): boolean {
  return (
    values.cooking_factor !== null &&
    isCookingFactorUnusual(values.cooking_factor)
  )
}

/**
 * The text of the unusual-factor confirmation, said as how much 100 g raw
 * yield. null when the factor is not valid.
 */
export function unusualYieldText(factor: number): string | null {
  const grams = cookedGramsPer100gRaw(factor)
  if (grams === null) return null
  return cookingFactorUnusualMessage(formatGrams(grams))
}

/** The row to insert for a new food: always manual (spec §6.3). */
export function toNewFood(values: FoodFormValues): NewFood {
  return { ...values, source: 'manual' }
}
