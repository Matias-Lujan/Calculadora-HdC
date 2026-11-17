import {
  isAuthApiError,
  isAuthRetryableFetchError,
} from '@supabase/supabase-js'
import {
  withUnitsWord,
  type CarbsPer100gError,
  type ItemErrorCode,
  type PositiveNumberError,
  type TypedNumberNotice,
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

/**
 * The session is missing or no longer valid, found outside supabase-js
 * errors: a 401 from the transcribe-label function, or no session when
 * uploading a photo.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

// True when the session is no longer valid and the user has to log in again.
export function isUnauthorized(error: unknown): boolean {
  if (error instanceof UnauthorizedError) return true
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
  // The label confirmation (src/features/foods/labelForm.ts, spec §6.1).
  | 'CARBS_EXCEED_PORTION'
  | 'FIBER_EXCEEDS_CARBS'
  | 'COLUMN_REQUIRED'
  | 'BASIS_REQUIRED'

const FOOD_FIELD_ERRORS: Record<FoodFieldError, string> = {
  ...POSITIVE_NUMBER_ERRORS,
  ABOVE_100: 'No puede ser más de 100 g cada 100 g.',
  STATE_REQUIRED: 'Elegí una opción.',
  UNIT_WEIGHT_REQUIRED: 'Completá el peso de la unidad, o borrá el nombre.',
  FACTOR_NOT_COMPUTABLE:
    'Con estos pesos no se puede calcular cuánto rinde. Revisalos.',
  CARBS_EXCEED_PORTION: 'No puede ser más que la porción.',
  FIBER_EXCEEDS_CARBS: 'No puede ser más que los HC.',
  COLUMN_REQUIRED: 'Elegí qué columna usar.',
  BASIS_REQUIRED: 'Elegí una opción.',
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
    'Los HC cada 100 g de este alimento no son válidos. Revisalo en «Mis alimentos».',
  MISSING_COOKING_FACTOR:
    'Falta cuánto rinde al cocinarlo. Cargalo en «Mis alimentos» para usar este alimento.',
  INVALID_COOKING_FACTOR:
    'Lo que rinde al cocinarlo no es válido. Revisalo en «Mis alimentos».',
  MISSING_UNIT_WEIGHT:
    'Este alimento no tiene peso por unidad. Cargá la cantidad en gramos.',
  UNITS_NOT_ALLOWED_FOR_RAW_COOKED:
    'Este alimento se carga en gramos cocidos, no en unidades.',
  EFFECTIVE_CARBS_OVER_100:
    'Con lo que rinde al cocinarlo, este alimento da más de 100 g de HC cada 100 g. Revisá en «Mis alimentos» cuánto rinde.',
}

export function mealItemErrorMessage(code: MealItemFoodError): string {
  return MEAL_ITEM_ERRORS[code]
}

/**
 * A warning of a meal (spec §8.5), shown in sight as soon as it appears and
 * asked for again before saving, with its values already formatted
 * (src/features/meals/mealDraft.ts: itemWarnings, doseWarning and
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

/**
 * A message with the number to check in bold: `before`, then `strong` (in
 * bold, empty if there is none) and `after`.
 */
export type EmphasizedMessage = {
  before: string
  strong: string
  after: string
}

/**
 * A warning in the confirmation before saving a meal (spec §8.5), with the
 * number to check in bold: "Arroz: **650 g**. Tu alerta es de 500 g por
 * alimento.".
 */
export function mealSaveWarningMessage(
  warning: MealSaveWarning,
): EmphasizedMessage {
  switch (warning.code) {
    case 'ITEM_GRAMS_ABOVE_THRESHOLD':
      return {
        before: `${warning.foodName}: `,
        strong: `${warning.grams} g`,
        after: `. Tu alerta es de ${warning.threshold} g por alimento.`,
      }
    case 'COOKING_FACTOR_UNUSUAL':
      return warning.cookedGrams === null
        ? {
            before: `${warning.foodName}: lo que rinde al cocinarlo está muy lejos de lo habitual.`,
            strong: '',
            after: '',
          }
        : {
            before: `${warning.foodName}: 100 g crudo rinden `,
            strong: `${warning.cookedGrams} g`,
            after: ' cocido, y lo habitual es entre 100 y 400 g.',
          }
    case 'DOSE_ABOVE_THRESHOLD':
      return {
        before: 'La dosis calculada da ',
        strong: withUnitsWord(warning.dose),
        after: `. Tu alerta es de ${withUnitsWord(warning.threshold)}.`,
      }
  }
}

/**
 * A warning in sight as soon as it appears, without waiting for "Guardar"
 * (spec §6.6): the ones of an item go under its quantity, so they do not
 * repeat its name; the dose one goes in the dose display.
 */
export function mealLiveWarningMessage(warning: MealSaveWarning): string {
  switch (warning.code) {
    case 'ITEM_GRAMS_ABOVE_THRESHOLD':
      return `Más que tu alerta de ${warning.threshold} g por alimento.`
    case 'COOKING_FACTOR_UNUSUAL':
      return warning.cookedGrams === null
        ? 'Lo que rinde al cocinarlo está muy lejos de lo habitual.'
        : `100 g crudo rinden ${warning.cookedGrams} g cocido, y lo habitual es entre 100 y 400 g.`
    case 'DOSE_ABOVE_THRESHOLD':
      return `Más que tu alerta de ${withUnitsWord(warning.threshold)}.`
  }
}

/**
 * The expected errors of the transcribe-label function (spec §9.3) that
 * the app shows with their own message. UNAUTHORIZED goes to the login
 * (UnauthorizedError), and INTERNAL_ERROR, like any other failure, is an
 * unexpected error (READ_ERROR_MESSAGE).
 */
export const VISION_ERROR_CODES = [
  'VISION_QUOTA_EXCEEDED',
  'DAILY_CAP_REACHED',
  'VISION_UNAVAILABLE',
  'VISION_BAD_RESPONSE',
  'INVALID_REQUEST',
] as const

export type VisionErrorCode = (typeof VISION_ERROR_CODES)[number]

/** An expected error of transcribe-label, with its code and retryable. */
export class VisionError extends Error {
  readonly code: VisionErrorCode
  readonly retryable: boolean

  constructor(code: VisionErrorCode, retryable: boolean) {
    super(code)
    this.name = 'VisionError'
    this.code = code
    this.retryable = retryable
  }
}

const VISION_ERRORS: Record<VisionErrorCode, string> = {
  VISION_QUOTA_EXCEEDED:
    'Se alcanzó el límite gratuito de lecturas de etiquetas. Podés cargar los datos a mano o probar de nuevo más tarde.',
  DAILY_CAP_REACHED:
    'Llegaste al máximo de lecturas automáticas de hoy. Podés cargar los datos a mano.',
  VISION_UNAVAILABLE:
    'El servicio de lectura no responde en este momento. Podés cargar los datos a mano o reintentar.',
  VISION_BAD_RESPONSE:
    'No se pudo interpretar la lectura de la etiqueta. Podés cargar los datos a mano o reintentar.',
  INVALID_REQUEST:
    'No se pudo leer la foto. Podés sacar otra o cargar los datos a mano.',
}

export function visionErrorMessage(code: VisionErrorCode): string {
  return VISION_ERRORS[code]
}

// The photo of a label (spec §6.1, §9.4).
export const NOT_A_LABEL_MESSAGE = 'La foto no parece una tabla nutricional.'
export const READ_ERROR_MESSAGE =
  'No se pudo leer la etiqueta. Revisá la conexión y reintentá.'
export const PHOTO_UPLOAD_ERROR_MESSAGE =
  'No se pudo subir la foto. Revisá la conexión y reintentá.'
export const PHOTO_OPEN_ERROR_MESSAGE =
  'No se pudo abrir la foto. Probá con otra.'
export const PHOTO_LOAD_ERROR_MESSAGE = 'No se pudo cargar la foto.'

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
