import {
  isAuthApiError,
  isAuthRetryableFetchError,
} from '@supabase/supabase-js'
import type {
  CarbsPer100gError,
  ItemErrorCode,
  PositiveNumberError,
  TypedNumberNotice,
} from '../domain/dose/index.ts'

// Single place where error codes become Spanish messages (CLAUDE.md,
// "Manejo de errores en la UI"). Only codes are inspected, never the raw
// message, which is never shown to the user.

// A Map (not an object literal) so codes like "toString" or "__proto__"
// don't resolve to inherited prototype members.
const SIGN_IN_MESSAGES = new Map<string, string>([
  ['invalid_credentials', 'El email o la contraseña no son correctos.'],
  [
    'over_request_rate_limit',
    'Hiciste demasiados intentos. Esperá unos minutos y volvé a probar.',
  ],
])

const CONNECTION_MESSAGE =
  'No se pudo conectar. Revisá la conexión y reintentá.'
const SIGN_IN_FALLBACK = 'No se pudo iniciar sesión. Reintentá en un momento.'

export function authErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return CONNECTION_MESSAGE
  if (isAuthApiError(error) && error.code !== undefined) {
    const message = SIGN_IN_MESSAGES.get(error.code)
    if (message !== undefined) return message
  }
  return SIGN_IN_FALLBACK
}

const UNAUTHORIZED_AUTH_CODES = new Set([
  'session_expired',
  'session_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
])

// PostgREST JWT errors (missing, invalid or expired token).
const UNAUTHORIZED_POSTGREST_CODES = new Set([
  'PGRST301',
  'PGRST302',
  'PGRST303',
])

// True when the session is no longer valid and the user has to log in again.
export function isUnauthorized(error: unknown): boolean {
  if (isAuthApiError(error)) {
    return error.code !== undefined && UNAUTHORIZED_AUTH_CODES.has(error.code)
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    return typeof code === 'string' && UNAUTHORIZED_POSTGREST_CODES.has(code)
  }
  return false
}

const TYPED_NUMBER_NOTICES: Record<TypedNumberNotice, string> = {
  DECIMAL_DOT: 'Los decimales van con coma.',
  REJECTED: 'Solo se pueden ingresar números, con coma para los decimales.',
}

// Notice under a number field when an edit was not taken as typed
// (spec §8.7). It is not an error: the field keeps a valid text.
export function typedNumberNoticeMessage(notice: TypedNumberNotice): string {
  return TYPED_NUMBER_NOTICES[notice]
}

const POSITIVE_NUMBER_ERRORS: Record<PositiveNumberError, string> = {
  REQUIRED: 'Completá este campo.',
  INVALID_NUMBER:
    'Escribí un número completo, con coma para los decimales (por ejemplo, 12,5).',
  NOT_POSITIVE: 'Tiene que ser mayor que 0.',
}

// Validation error of a field that needs a number > 0.
export function positiveNumberErrorMessage(code: PositiveNumberError): string {
  return POSITIVE_NUMBER_ERRORS[code]
}

/**
 * Validation errors of the food form fields (src/features/foods/foodForm.ts).
 * Declared here, and not in the feature, because lib does not import
 * features.
 */
export type FoodFieldError =
  | PositiveNumberError
  | CarbsPer100gError
  | 'STATE_REQUIRED'
  | 'UNIT_WEIGHT_REQUIRED'
  | 'FACTOR_NOT_COMPUTABLE'

const FOOD_FIELD_ERRORS: Record<FoodFieldError, string> = {
  ...POSITIVE_NUMBER_ERRORS,
  ABOVE_100: 'No puede ser más de 100 g cada 100 g.',
  STATE_REQUIRED: 'Elegí una opción.',
  UNIT_WEIGHT_REQUIRED: 'Completá el peso de la unidad, o borrá el nombre.',
  FACTOR_NOT_COMPUTABLE:
    'Con estos pesos no se puede calcular cuánto rinde. Revisalos.',
}

export function foodFieldErrorMessage(code: FoodFieldError): string {
  return FOOD_FIELD_ERRORS[code]
}

// Confirmation asked before saving a cooking factor outside 1–4 (spec §6.4),
// said as how much 100 g raw yield. Receives the cooked grams already
// formatted (foodForm.ts, unusualYieldText).
export function cookingFactorUnusualMessage(cookedGrams: string): string {
  return `Con estos datos, 100 g crudo rinden ${cookedGrams} g cocido, y lo habitual es entre 100 y 400 g. Puede ser un error de tipeo. ¿Lo guardás igual?`
}

/**
 * Errors of a meal item that come from its food, not from the quantity
 * (spec §8.4). They are shown in the item right away; INVALID_QUANTITY is
 * the quantity field error, shown on blur with positiveNumberErrorMessage.
 */
export type MealItemFoodError = Exclude<ItemErrorCode, 'INVALID_QUANTITY'>

const MEAL_ITEM_ERRORS: Record<MealItemFoodError, string> = {
  INVALID_CARBS:
    'Los HC cada 100 g de este alimento no son válidos. Revisalo en el catálogo.',
  MISSING_COOKING_FACTOR:
    'Falta cuánto rinde al cocinarlo. Cargalo en el catálogo para usar este alimento.',
  INVALID_COOKING_FACTOR:
    'Lo que rinde al cocinarlo no es válido. Revisalo en el catálogo.',
  MISSING_UNIT_WEIGHT:
    'Este alimento no tiene peso por unidad. Cargá la cantidad en gramos.',
  UNITS_NOT_ALLOWED_FOR_RAW_COOKED:
    'Este alimento se carga en gramos cocidos, no en unidades.',
  EFFECTIVE_CARBS_OVER_100:
    'Con lo que rinde al cocinarlo, este alimento da más de 100 g de HC cada 100 g. Revisá en el catálogo cuánto rinde.',
}

export function mealItemErrorMessage(code: MealItemFoodError): string {
  return MEAL_ITEM_ERRORS[code]
}

/**
 * A warning that asks for confirmation before saving a meal (spec §8.5),
 * with its values already formatted (src/features/meals/mealDraft.ts,
 * saveWarnings). Declared here, and not in the feature, because lib does
 * not import features.
 */
export type MealSaveWarning =
  | {
      code: 'ITEM_GRAMS_ABOVE_THRESHOLD'
      foodName: string
      grams: string
      threshold: string
    }
  | {
      code: 'COOKING_FACTOR_UNUSUAL'
      foodName: string
      /** How much 100 g raw yield, formatted; null if it cannot be shown. */
      cookedGrams: string | null
    }
  | { code: 'DOSE_ABOVE_THRESHOLD'; dose: string; threshold: string }

export function mealSaveWarningMessage(warning: MealSaveWarning): string {
  switch (warning.code) {
    case 'ITEM_GRAMS_ABOVE_THRESHOLD':
      return `${warning.foodName}: ${warning.grams} g, más que tu alerta de ${warning.threshold} g por alimento.`
    case 'COOKING_FACTOR_UNUSUAL':
      return warning.cookedGrams === null
        ? `${warning.foodName}: lo que rinde al cocinarlo está muy lejos de lo habitual.`
        : `${warning.foodName}: 100 g crudo rinden ${warning.cookedGrams} g cocido, y lo habitual es entre 100 y 400 g.`
    case 'DOSE_ABOVE_THRESHOLD':
      return `La dosis calculada da ${warning.dose} U, más que tu alerta de ${warning.threshold} U.`
  }
}

// The date and time field of a meal, when it is empty or not a real date.
export const EATEN_AT_ERROR_MESSAGE = 'Elegí la fecha y la hora.'

// "Guardar" on a meal with errors (an item, the applied dose or the date).
export const MEAL_BLOCKED_MESSAGE =
  'Corregí los datos marcados para poder guardar.'

// The meal total when the ratio is not valid (INVALID_RATIO, spec §8.4).
export const INVALID_RATIO_MESSAGE =
  'El ratio de Configuración no es válido. Revisalo en Configuración.'

// The meal total when every item is valid but the total carbs or the dose
// overflow (meal-level INVALID_QUANTITY, spec §8.4).
export const MEAL_OUT_OF_RANGE_MESSAGE =
  'El total o la dosis dan un número demasiado grande. Revisá las cantidades y el ratio de Configuración.'

// Unexpected errors (network down, 500): the form keeps what was entered
// and the user retries.
export const LOAD_ERROR_MESSAGE =
  'No se pudo cargar. Revisá la conexión y reintentá.'
export const SAVE_ERROR_MESSAGE =
  'No se pudo guardar. Revisá la conexión y reintentá.'
export const ARCHIVE_ERROR_MESSAGE =
  'No se pudo archivar. Revisá la conexión y reintentá.'
export const DELETE_ERROR_MESSAGE =
  'No se pudo borrar. Revisá la conexión y reintentá.'
export const SIGN_OUT_ERROR_MESSAGE = 'No se pudo cerrar la sesión. Reintentá.'
