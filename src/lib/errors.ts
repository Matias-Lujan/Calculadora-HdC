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
    'Con estos pesos no se puede calcular el factor. Revisalos.',
}

export function foodFieldErrorMessage(code: FoodFieldError): string {
  return FOOD_FIELD_ERRORS[code]
}

// Confirmation asked before saving a cooking factor outside 1–4 (spec §6.4).
// Receives the factor already formatted with formatCookingFactor.
export function cookingFactorUnusualMessage(formattedFactor: string): string {
  return `El factor de cocción da ${formattedFactor}, fuera de lo habitual (entre 1 y 4). Puede ser un error de tipeo. ¿Lo guardás igual?`
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
    'Falta el factor de cocción. Cargalo en el catálogo para usar este alimento.',
  INVALID_COOKING_FACTOR:
    'El factor de cocción de este alimento no es válido. Revisalo en el catálogo.',
  MISSING_UNIT_WEIGHT:
    'Este alimento no tiene peso por unidad. Cargá la cantidad en gramos.',
  UNITS_NOT_ALLOWED_FOR_RAW_COOKED:
    'Este alimento se carga en gramos cocidos, no en unidades.',
  EFFECTIVE_CARBS_OVER_100:
    'Con su factor de cocción, este alimento da más de 100 g de HC cada 100 g. Revisá el factor en el catálogo.',
}

export function mealItemErrorMessage(code: MealItemFoodError): string {
  return MEAL_ITEM_ERRORS[code]
}

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
export const SIGN_OUT_ERROR_MESSAGE = 'No se pudo cerrar la sesión. Reintentá.'
