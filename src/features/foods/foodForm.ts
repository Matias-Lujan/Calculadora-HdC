import {
  cookingFactorFromWeights,
  formatCookingFactor,
  formatUserNumber,
  isCookingFactorUnusual,
  parseCarbsPer100g,
  parsePositiveUserNumber,
} from '../../domain/dose/index.ts'
import type { FoodFieldError } from '../../lib/errors.ts'
import {
  REFERENCE_DB_LABELS,
  type Food,
  type FoodFormValues,
  type FormSource,
  type NewFood,
} from './types.ts'

// Pure logic of the food form (create and edit, spec §6.2–§6.5). It does no
// math of its own: numbers go through src/domain/dose.

/** How the cooking factor is entered: measured with weights or typed. */
export type FactorMode = 'measure' | 'direct'

/** What the form fields hold, as typed. */
export type FoodFormTexts = {
  name: string
  brand: string
  state: Food['state'] | null
  carbsPer100g: string
  factorMode: FactorMode
  rawWeight: string
  cookedWeight: string
  cookingFactor: string
  unitWeight: string
  unitLabel: string
  notes: string
  referenceCode: string
  referenceDescription: string
}

/**
 * The error of each field, by field name. `measuredFactor` is the error of
 * the factor measured with both weights.
 */
export type FoodFormErrors = Partial<
  Record<keyof FoodFormTexts | 'measuredFactor', FoodFieldError>
>

export type FoodFormResult = {
  /** null when there is any error. */
  values: FoodFormValues | null
  errors: FoodFormErrors
}

function numberText(value: number | null): string {
  return value === null ? '' : formatUserNumber(value)
}

/**
 * The texts the form starts with: empty for a new food (no state chosen,
 * factor measured), or the food's values, exact, when editing.
 */
export function initialFoodFormTexts(food?: Food): FoodFormTexts {
  if (food === undefined) {
    return {
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
    }
  }
  return {
    name: food.name,
    brand: food.brand ?? '',
    state: food.state,
    carbsPer100g: formatUserNumber(food.carbs_per_100g),
    factorMode: food.cooking_factor === null ? 'measure' : 'direct',
    rawWeight: '',
    cookedWeight: '',
    cookingFactor: numberText(food.cooking_factor),
    unitWeight: numberText(food.unit_weight_g),
    unitLabel: food.unit_label ?? '',
    notes: food.notes ?? '',
    referenceCode: food.reference_code ?? '',
    referenceDescription: food.reference_description ?? '',
  }
}

/** Trimmed text, or null when it is empty. */
function optionalText(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The live line of the measured factor (spec §6.4), "Factor = 260 ÷ 100 =
 * 2,60": the weights exact, the factor with 2 decimals. null when a weight
 * is missing or not valid, or the quotient is not computable. It does not
 * depend on the factor mode.
 */
export function measuredFactorLine(
  texts: Pick<FoodFormTexts, 'rawWeight' | 'cookedWeight'>,
): string | null {
  const raw = parsePositiveUserNumber(texts.rawWeight)
  const cooked = parsePositiveUserNumber(texts.cookedWeight)
  if ('error' in raw || 'error' in cooked) return null
  const factor = cookingFactorFromWeights(raw.value, cooked.value)
  if (factor === null) return null
  return `Factor = ${formatUserNumber(cooked.value)} ÷ ${formatUserNumber(raw.value)} = ${formatCookingFactor(factor)}`
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

type ReferenceDb = Food['reference_db']

/** The source shown when editing (it is not editable). */
export function sourceText(
  source: Food['source'],
  referenceDb: ReferenceDb,
): string {
  if (source === 'manual') return 'Manual'
  if (source === 'label') return 'Etiqueta'
  return referenceDb === null
    ? 'Tabla de referencia'
    : `Tabla de referencia (${REFERENCE_DB_LABELS[referenceDb]})`
}

/** The label of the reference code field. */
export function referenceCodeLabel(referenceDb: ReferenceDb): string {
  return referenceDb === null
    ? 'Código de referencia'
    : `Código ${REFERENCE_DB_LABELS[referenceDb]}`
}

/** "HC asimilables" is ARGENFOODS's name for carbs without fiber (§6.2). */
export function carbsLabel(
  referenceDb: ReferenceDb,
  state: Food['state'] | null,
): string {
  const raw = state === 'raw_cooked' ? ', en crudo' : ''
  if (referenceDb === 'argenfoods') return `HC asimilables cada 100 g${raw}`
  return `HC cada 100 g${raw} (sin fibra)`
}

/** Cooking factor of a raw_cooked food: null is a valid "not loaded yet". */
function validateCookingFactor(
  texts: FoodFormTexts,
  errors: FoodFormErrors,
): number | null {
  if (texts.factorMode === 'direct') {
    if (texts.cookingFactor.trim() === '') return null
    const result = parsePositiveUserNumber(texts.cookingFactor)
    if ('error' in result) {
      errors.cookingFactor = result.error
      return null
    }
    return result.value
  }

  const rawEmpty = texts.rawWeight.trim() === ''
  const cookedEmpty = texts.cookedWeight.trim() === ''
  if (rawEmpty && cookedEmpty) return null

  const raw = parsePositiveUserNumber(texts.rawWeight)
  const cooked = parsePositiveUserNumber(texts.cookedWeight)
  if ('error' in raw) errors.rawWeight = raw.error
  if ('error' in cooked) errors.cookedWeight = cooked.error
  if ('error' in raw || 'error' in cooked) return null

  const factor = cookingFactorFromWeights(raw.value, cooked.value)
  if (factor === null) errors.measuredFactor = 'FACTOR_NOT_COMPUTABLE'
  return factor
}

/** Weight and name of one unit of an as_eaten food (both optional). */
function validateUnit(
  texts: FoodFormTexts,
  errors: FoodFormErrors,
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
  return { unit_weight_g: result.value, unit_label: unitLabel }
}

/**
 * Validates the form and returns what to save, or the error of each field.
 * Hidden fields (the factor of an as_eaten food, the unit of a raw_cooked
 * one, the inactive factor mode, the reference fields of another source)
 * are neither validated nor saved, even if they still hold text.
 */
export function validateFoodForm(
  texts: FoodFormTexts,
  source: Food['source'],
): FoodFormResult {
  const errors: FoodFormErrors = {}

  const name = texts.name.trim()
  if (name === '') errors.name = 'REQUIRED'

  const notes = optionalText(texts.notes)
  if (source === 'manual' && notes === null) errors.notes = 'REQUIRED'

  let referenceCode: string | null = null
  let referenceDescription: string | null = null
  if (source === 'reference') {
    referenceCode = optionalText(texts.referenceCode)
    if (referenceCode === null) errors.referenceCode = 'REQUIRED'
    referenceDescription = optionalText(texts.referenceDescription)
  }

  const carbs = parseCarbsPer100g(texts.carbsPer100g)
  if ('error' in carbs) errors.carbsPer100g = carbs.error

  let cookingFactor: number | null = null
  let unit: { unit_weight_g: number | null; unit_label: string | null } = {
    unit_weight_g: null,
    unit_label: null,
  }
  if (texts.state === null) {
    errors.state = 'STATE_REQUIRED'
  } else if (texts.state === 'raw_cooked') {
    cookingFactor = validateCookingFactor(texts, errors)
  } else {
    unit = validateUnit(texts, errors)
  }

  if (
    Object.keys(errors).length > 0 ||
    texts.state === null ||
    'error' in carbs
  ) {
    return { values: null, errors }
  }

  return {
    values: {
      name,
      brand: optionalText(texts.brand),
      state: texts.state,
      carbs_per_100g: carbs.value,
      cooking_factor: cookingFactor,
      unit_weight_g: unit.unit_weight_g,
      unit_label: unit.unit_label,
      notes,
      reference_code: referenceCode,
      reference_description: referenceDescription,
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

/** The reference base a new food gets: from the form, only ARGENFOODS. */
export function newFoodReferenceDb(
  source: FormSource,
): NewFood['reference_db'] {
  return source === 'reference' ? 'argenfoods' : null
}

/** The row to insert for a new food. */
export function toNewFood(source: FormSource, values: FoodFormValues): NewFood {
  return {
    ...values,
    source,
    reference_db: newFoodReferenceDb(source),
  }
}
