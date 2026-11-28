import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
  PostgrestError,
} from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type {
  PositiveNumberError,
  TypedNumberNotice,
} from '../domain/dose/index.ts'
import {
  ARCHIVE_ERROR_MESSAGE,
  DELETE_ERROR_MESSAGE,
  EATEN_AT_ERROR_MESSAGE,
  INVALID_RATIO_MESSAGE,
  MEAL_BLOCKED_MESSAGE,
  MEAL_OUT_OF_RANGE_MESSAGE,
  LOAD_ERROR_MESSAGE,
  SAVE_ERROR_MESSAGE,
  SIGN_OUT_ERROR_MESSAGE,
  appliedDoseErrorMessage,
  authErrorMessage,
  cookingFactorUnusualMessage,
  foodFieldErrorMessage,
  isPermissionDenied,
  isUnauthorized,
  UnauthorizedError,
  VisionError,
  visionErrorMessage,
  mealItemErrorMessage,
  mealLiveWarningMessage,
  mealProblemMessage,
  mealSaveWarningMessage,
  type EmphasizedMessage,
  type FoodFieldError,
  type MealProblem,
  type MealSaveWarning,
  type MealItemFoodError,
  type RequiredFoodField,
  positiveNumberErrorMessage,
  quantityErrorMessage,
  ratioErrorMessage,
  typedNumberNoticeMessage,
} from './errors.ts'

const CREDENTIALS = 'El email o la contraseña no son correctos.'
const RATE_LIMIT =
  'Hiciste demasiados intentos. Esperá unos minutos y volvé a probar.'
const CONNECTION = 'No se pudo conectar. Revisá la conexión y reintentá.'
const GENERIC = 'No se pudo iniciar sesión. Reintentá en un momento.'

describe('authErrorMessage', () => {
  it('maps invalid_credentials', () => {
    const error = new AuthApiError('x', 400, 'invalid_credentials')
    expect(authErrorMessage(error)).toBe(CREDENTIALS)
  })

  it('maps over_request_rate_limit', () => {
    const error = new AuthApiError('x', 429, 'over_request_rate_limit')
    expect(authErrorMessage(error)).toBe(RATE_LIMIT)
  })

  it.each([0, 503])(
    'maps AuthRetryableFetchError (status %i) to the connection message',
    (status) => {
      const error = new AuthRetryableFetchError('x', status)
      expect(authErrorMessage(error)).toBe(CONNECTION)
    },
  )

  it.each(['something_else', undefined])(
    'falls back to the generic message for code %s',
    (code) => {
      const error = new AuthApiError('x', 400, code)
      expect(authErrorMessage(error)).toBe(GENERIC)
    },
  )

  it.each([new Error('x'), null, undefined, 'texto', 42, {}])(
    'falls back to the generic message for non-auth value %#',
    (value) => {
      expect(authErrorMessage(value)).toBe(GENERIC)
    },
  )

  it.each([
    { code: 'invalid_credentials' },
    { code: 'over_request_rate_limit', name: 'AuthApiError' },
    new AuthError('x', 400, 'invalid_credentials'),
  ])('only maps codes coming from an AuthApiError %#', (value) => {
    expect(authErrorMessage(value)).toBe(GENERIC)
  })

  it.each([
    new AuthSessionMissingError(),
    new AuthWeakPasswordError('x', 422, []),
    new AuthApiError('x', 401, 'session_not_found'),
  ])('falls back to the generic message for other auth errors %#', (error) => {
    expect(authErrorMessage(error)).toBe(GENERIC)
  })

  it('maps codes exactly (no case folding)', () => {
    const error = new AuthApiError('x', 400, 'INVALID_CREDENTIALS')
    expect(authErrorMessage(error)).toBe(GENERIC)
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'does not treat the inherited key %s as a known code',
    (code) => {
      expect(authErrorMessage(new AuthApiError('x', 400, code))).toBe(GENERIC)
    },
  )

  it('never returns the raw message', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'unknown')
    expect(authErrorMessage(error)).not.toBe('Invalid login credentials')
    expect(authErrorMessage(error)).toBe(GENERIC)
  })
})

describe('isUnauthorized', () => {
  it.each(['PGRST301', 'PGRST302', 'PGRST303'])(
    'is true for PostgREST JWT error %s',
    (code) => {
      expect(isUnauthorized({ code })).toBe(true)
    },
  )

  it.each([{ code: 'PGRST116' }, { code: 23514 }, { code: 'pgrst301' }])(
    'is false for other PostgREST-like errors %#',
    (value) => {
      expect(isUnauthorized(value)).toBe(false)
    },
  )

  it.each([
    'session_expired',
    'session_not_found',
    'refresh_token_not_found',
    'refresh_token_already_used',
    'bad_jwt',
    'user_not_found',
  ])('is true for AuthApiError %s', (code) => {
    expect(isUnauthorized(new AuthApiError('x', 401, code))).toBe(true)
  })

  it.each(['PGRST301', 'PGRST302', 'PGRST303'])(
    'is true for a real PostgrestError %s',
    (code) => {
      const error = new PostgrestError({
        message: 'x',
        details: '',
        hint: '',
        code,
      })
      expect(isUnauthorized(error)).toBe(true)
    },
  )

  it('is false for a PostgrestError that is not about the JWT', () => {
    const error = new PostgrestError({
      message: 'x',
      details: '',
      hint: '',
      code: '42501',
    })
    expect(isUnauthorized(error)).toBe(false)
  })

  it.each(['over_request_rate_limit', 'weak_password', 'PGRST301', undefined])(
    'is false for AuthApiError with code %s',
    (code) => {
      expect(isUnauthorized(new AuthApiError('x', 401, code))).toBe(false)
    },
  )

  it.each(['SESSION_NOT_FOUND', 'session_not_found ', 'pgrst301', 'PGRST3010'])(
    'matches codes exactly: %s is false',
    (code) => {
      expect(isUnauthorized(new AuthApiError('x', 401, code))).toBe(false)
      expect(isUnauthorized({ code })).toBe(false)
    },
  )

  it.each([
    { code: 'session_not_found' },
    { code: 'bad_jwt', status: 401 },
    { status: 401 },
    { code: null },
    { code: undefined },
    {},
  ])('only trusts auth codes on an AuthApiError %#', (value) => {
    expect(isUnauthorized(value)).toBe(false)
  })

  it.each([new AuthSessionMissingError(), new AuthError('x', 401)])(
    'is false for other auth errors without a code %#',
    (error) => {
      expect(isUnauthorized(error)).toBe(false)
    },
  )

  it('is false for AuthApiError invalid_credentials', () => {
    const error = new AuthApiError('x', 400, 'invalid_credentials')
    expect(isUnauthorized(error)).toBe(false)
  })

  it('is false for AuthRetryableFetchError (the session is kept)', () => {
    expect(isUnauthorized(new AuthRetryableFetchError('x', 0))).toBe(false)
  })

  it('is true for UnauthorizedError (a 401 of transcribe-label)', () => {
    expect(isUnauthorized(new UnauthorizedError())).toBe(true)
  })

  it('is false for a VisionError', () => {
    expect(isUnauthorized(new VisionError('DAILY_CAP_REACHED', false))).toBe(
      false,
    )
  })

  it.each([null, undefined, 'PGRST301', 401, new Error('x')])(
    'is false for non-error value %#',
    (value) => {
      expect(isUnauthorized(value)).toBe(false)
    },
  )
})

describe('isPermissionDenied', () => {
  it('is true for a PostgrestError 42501', () => {
    const error = new PostgrestError({
      message: 'x',
      details: '',
      hint: '',
      code: '42501',
    })
    expect(isPermissionDenied(error)).toBe(true)
  })

  it.each([
    { code: 'PGRST116' },
    { code: '23514' },
    { code: 'PGRST301' },
    { code: 42501 },
    { code: '42501 ' },
    { code: null },
    {},
  ])('is false for other codes %#', (value) => {
    expect(isPermissionDenied(value)).toBe(false)
  })

  it.each([null, undefined, '42501', 42501, new Error('42501')])(
    'is false for non-error value %#',
    (value) => {
      expect(isPermissionDenied(value)).toBe(false)
    },
  )
})

describe('typedNumberNoticeMessage', () => {
  it.each<[TypedNumberNotice, string]>([
    ['DECIMAL_DOT', 'Los decimales van con coma.'],
    [
      'REJECTED',
      'Solo se pueden ingresar números, con coma para los decimales.',
    ],
  ])('%s', (notice, message) => {
    expect(typedNumberNoticeMessage(notice)).toBe(message)
  })
})

describe('positiveNumberErrorMessage', () => {
  it.each<[PositiveNumberError, string]>([
    ['REQUIRED', 'Completá este campo.'],
    [
      'INVALID_NUMBER',
      'Escribí un número completo, con coma para los decimales (por ejemplo, 12,5).',
    ],
    ['NOT_POSITIVE', 'Tiene que ser mayor que 0.'],
  ])('%s', (code, message) => {
    expect(positiveNumberErrorMessage(code)).toBe(message)
  })
})

describe('messages', () => {
  const codes: (TypedNumberNotice | PositiveNumberError)[] = [
    'DECIMAL_DOT',
    'REJECTED',
    'REQUIRED',
    'INVALID_NUMBER',
    'NOT_POSITIVE',
  ]
  const messages = [
    typedNumberNoticeMessage('DECIMAL_DOT'),
    typedNumberNoticeMessage('REJECTED'),
    positiveNumberErrorMessage('REQUIRED'),
    positiveNumberErrorMessage('INVALID_NUMBER'),
    positiveNumberErrorMessage('NOT_POSITIVE'),
    LOAD_ERROR_MESSAGE,
    SAVE_ERROR_MESSAGE,
    ARCHIVE_ERROR_MESSAGE,
    DELETE_ERROR_MESSAGE,
    SIGN_OUT_ERROR_MESSAGE,
    INVALID_RATIO_MESSAGE,
    MEAL_OUT_OF_RANGE_MESSAGE,
  ]

  it.each(messages)('%j is not empty and is not a code', (message) => {
    expect(message.trim()).not.toBe('')
    expect(codes).not.toContain(message)
  })

  it('are all different', () => {
    expect(new Set(messages).size).toBe(messages.length)
  })

  it.each(messages)(
    '%j has no code-like word and ends with a period',
    (message) => {
      expect(message).not.toMatch(/[A-Z_]{4,}/)
      expect(message.endsWith('.')).toBe(true)
    },
  )

  it('the save error is the generic one from CLAUDE.md', () => {
    expect(SAVE_ERROR_MESSAGE).toBe(
      'No se pudo guardar. Revisá la conexión y reintentá.',
    )
  })

  it('the archive error is the one from spec §14 #40', () => {
    expect(ARCHIVE_ERROR_MESSAGE).toBe(
      'No se pudo archivar. Revisá la conexión y reintentá.',
    )
  })

  it('the delete error is the one from spec §14 #47', () => {
    expect(DELETE_ERROR_MESSAGE).toBe(
      'No se pudo borrar. Revisá la conexión y reintentá.',
    )
  })

  it('the sign-out error is the one from spec §14 #36', () => {
    expect(SIGN_OUT_ERROR_MESSAGE).toBe(
      'No se pudo cerrar la sesión. Reintentá.',
    )
  })
})

describe('foodFieldErrorMessage', () => {
  const codes: FoodFieldError[] = [
    'REQUIRED',
    'INVALID_NUMBER',
    'NOT_POSITIVE',
    'ABOVE_100',
    'NAME_REQUIRED',
    'STATE_REQUIRED',
    'UNIT_WEIGHT_REQUIRED',
    'FACTOR_NOT_COMPUTABLE',
  ]

  it.each(codes)('%s has a message that is not a code', (code) => {
    const message = foodFieldErrorMessage(code)
    expect(message.trim()).not.toBe('')
    expect(message).not.toMatch(/[A-Z_]{4,}/)
    expect(message.endsWith('.')).toBe(true)
  })

  it('all messages are different', () => {
    const messages = codes.map((code) => foodFieldErrorMessage(code))
    expect(new Set(messages).size).toBe(messages.length)
  })

  it.each<[FoodFieldError, string]>([
    ['REQUIRED', 'Completá este campo.'],
    ['ABOVE_100', 'No puede ser más de 100 g cada 100 g.'],
    ['STATE_REQUIRED', 'Elegí si se cocina antes de comer.'],
    ['BASIS_REQUIRED', 'Elegí si los HC son de una porción o cada 100 g.'],
    [
      'UNIT_WEIGHT_REQUIRED',
      'Completá el peso de la unidad, o borrá el nombre.',
    ],
    [
      'FACTOR_NOT_COMPUTABLE',
      'Con estos pesos no se puede calcular cuánto rinde. Revisalos.',
    ],
  ])('%s', (code, message) => {
    expect(foodFieldErrorMessage(code)).toBe(message)
  })

  it.each<PositiveNumberError>(['REQUIRED', 'INVALID_NUMBER', 'NOT_POSITIVE'])(
    '%s says the same as positiveNumberErrorMessage',
    (code) => {
      expect(foodFieldErrorMessage(code)).toBe(positiveNumberErrorMessage(code))
    },
  )
})

describe('cookingFactorUnusualMessage', () => {
  it('says how much 100 g raw yield, with the formatted grams', () => {
    const message = cookingFactorUnusualMessage('90')
    expect(message).toContain('90 g cocido')
    expect(message).toBe(
      'Con estos datos, 100 g crudo rinden 90 g cocido, y lo habitual es entre 100 y 400 g. Puede ser un error de tipeo. ¿Lo guardás igual?',
    )
  })
})

describe('mealItemErrorMessage', () => {
  const codes: MealItemFoodError[] = [
    'INVALID_CARBS',
    'MISSING_COOKING_FACTOR',
    'INVALID_COOKING_FACTOR',
    'MISSING_UNIT_WEIGHT',
    'UNITS_NOT_ALLOWED_FOR_RAW_COOKED',
    'EFFECTIVE_CARBS_OVER_100',
  ]

  it.each(codes)('%s has a message that is not a code', (code) => {
    const message = mealItemErrorMessage(code)
    expect(message.trim()).not.toBe('')
    expect(message).not.toContain(code)
    expect(message).not.toMatch(/[A-Z_]{4,}/)
    expect(message.endsWith('.')).toBe(true)
  })

  it('all messages are different', () => {
    const messages = codes.map(mealItemErrorMessage)
    expect(new Set(messages).size).toBe(messages.length)
  })

  it.each([
    [
      'INVALID_CARBS',
      'Los HC cada 100 g de este alimento no son válidos. Revisalo en "Mis alimentos".',
    ],
    [
      'MISSING_COOKING_FACTOR',
      'Falta cuánto rinde al cocinarlo. Cargalo en "Mis alimentos" para usar este alimento.',
    ],
    [
      'INVALID_COOKING_FACTOR',
      'Lo que rinde al cocinarlo no es válido. Revisalo en "Mis alimentos".',
    ],
    [
      'MISSING_UNIT_WEIGHT',
      'Este alimento no tiene peso por unidad. Cargá la cantidad en gramos.',
    ],
    [
      'UNITS_NOT_ALLOWED_FOR_RAW_COOKED',
      'Este alimento se carga en gramos cocidos, no en unidades.',
    ],
    [
      'EFFECTIVE_CARBS_OVER_100',
      'Con lo que rinde al cocinarlo, este alimento da más de 100 g de HC cada 100 g. Revisá en "Mis alimentos" cuánto rinde.',
    ],
  ] as const)('%s says %j', (code, message) => {
    expect(mealItemErrorMessage(code)).toBe(message)
  })
})

describe('INVALID_RATIO_MESSAGE', () => {
  it('is not a code and points to Configuración', () => {
    expect(INVALID_RATIO_MESSAGE).not.toMatch(/[A-Z_]{4,}/)
    expect(INVALID_RATIO_MESSAGE).toContain('Configuración')
    expect(INVALID_RATIO_MESSAGE.endsWith('.')).toBe(true)
  })
})

const NBSP = '\u00a0'

const ALL_WARNINGS: MealSaveWarning[] = [
  {
    code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
    foodName: 'A',
    grams: '1',
    threshold: '1',
  },
  { code: 'COOKING_FACTOR_UNUSUAL', foodName: 'A', cookedGrams: '1' },
  { code: 'COOKING_FACTOR_UNUSUAL', foodName: 'A', cookedGrams: null },
  { code: 'DOSE_ABOVE_THRESHOLD', dose: '1', threshold: '1' },
]

function joined(message: EmphasizedMessage): string {
  return `${message.before}${message.strong}${message.after}`
}

describe('mealSaveWarningMessage (the confirmation before saving)', () => {
  it('a food above the grams threshold, with its grams in bold', () => {
    expect(
      mealSaveWarningMessage({
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Arroz largo fino',
        grams: '650',
        threshold: '500',
      }),
    ).toEqual({
      before: 'Arroz largo fino: ',
      strong: '650 g',
      after: '. Tu alerta es de 500 g por alimento.',
    })
  })

  it('an unusual cooking factor, said as how much 100 g raw yield', () => {
    const message = mealSaveWarningMessage({
      code: 'COOKING_FACTOR_UNUSUAL',
      foodName: 'Arroz de prueba',
      cookedGrams: '450',
    })
    expect(message.strong).toBe('450 g')
    expect(joined(message)).toBe(
      'Arroz de prueba: 100 g crudo rinden 450 g cocido, y lo habitual es entre 100 y 400 g.',
    )
  })

  it('an unusual cooking factor whose yield cannot be shown: nothing in bold', () => {
    expect(
      mealSaveWarningMessage({
        code: 'COOKING_FACTOR_UNUSUAL',
        foodName: 'Arroz de prueba',
        cookedGrams: null,
      }),
    ).toEqual({
      before:
        'Arroz de prueba: lo que rinde al cocinarlo está muy lejos de lo habitual.',
      strong: '',
      after: '',
    })
  })

  it('a dose above the threshold, with "unidades" and the dose in bold', () => {
    expect(
      mealSaveWarningMessage({
        code: 'DOSE_ABOVE_THRESHOLD',
        dose: '16,55',
        threshold: '15',
      }),
    ).toEqual({
      before: 'La dosis calculada da ',
      strong: `16,55${NBSP}unidades`,
      after: `. Tu alerta es de 15${NBSP}unidades.`,
    })
  })

  it('a threshold of 1 is in singular; a dose of "1,00", in plural', () => {
    expect(
      joined(
        mealSaveWarningMessage({
          code: 'DOSE_ABOVE_THRESHOLD',
          dose: '1,00',
          threshold: '1',
        }),
      ),
    ).toBe(
      `La dosis calculada da 1,00${NBSP}unidades. Tu alerta es de 1${NBSP}unidad.`,
    )
  })

  it.each(ALL_WARNINGS)(
    'never shows a code nor "U", and ends with a period (%o)',
    (warning) => {
      const text = joined(mealSaveWarningMessage(warning))
      expect(text).not.toMatch(/[A-Z_]{4,}/)
      expect(text).not.toMatch(/\bU\b/)
      expect(text.endsWith('.')).toBe(true)
    },
  )
})

describe('mealLiveWarningMessage (in sight, without waiting for "Guardar")', () => {
  it('a food above the grams threshold, under its quantity', () => {
    expect(
      mealLiveWarningMessage({
        code: 'ITEM_GRAMS_ABOVE_THRESHOLD',
        foodName: 'Arroz largo fino',
        grams: '650',
        threshold: '500',
      }),
    ).toBe('Más que tu alerta de 500 g por alimento.')
  })

  it('an unusual cooking factor, without the name of the food', () => {
    expect(
      mealLiveWarningMessage({
        code: 'COOKING_FACTOR_UNUSUAL',
        foodName: 'Arroz de prueba',
        cookedGrams: '450',
      }),
    ).toBe(
      '100 g crudo rinden 450 g cocido, y lo habitual es entre 100 y 400 g.',
    )
  })

  it('an unusual cooking factor whose yield cannot be shown', () => {
    expect(
      mealLiveWarningMessage({
        code: 'COOKING_FACTOR_UNUSUAL',
        foodName: 'Arroz de prueba',
        cookedGrams: null,
      }),
    ).toBe('Lo que rinde al cocinarlo está muy lejos de lo habitual.')
  })

  it('the dose, in the dose display', () => {
    expect(
      mealLiveWarningMessage({
        code: 'DOSE_ABOVE_THRESHOLD',
        dose: '16,55',
        threshold: '15',
      }),
    ).toBe(`Más que tu alerta de 15${NBSP}unidades.`)
    expect(
      mealLiveWarningMessage({
        code: 'DOSE_ABOVE_THRESHOLD',
        dose: '2,00',
        threshold: '1',
      }),
    ).toBe(`Más que tu alerta de 1${NBSP}unidad.`)
  })

  it.each(ALL_WARNINGS)(
    'never shows a code nor "U", and ends with a period (%o)',
    (warning) => {
      const text = mealLiveWarningMessage(warning)
      expect(text).not.toMatch(/[A-Z_]{4,}/)
      expect(text).not.toMatch(/\bU\b/)
      expect(text.endsWith('.')).toBe(true)
    },
  )
})

describe('meal save messages', () => {
  it('EATEN_AT_ERROR_MESSAGE', () => {
    expect(EATEN_AT_ERROR_MESSAGE).toBe('Elegí la fecha y la hora.')
  })

  it('MEAL_BLOCKED_MESSAGE', () => {
    expect(MEAL_BLOCKED_MESSAGE).toBe(
      'Corregí los datos marcados para poder guardar.',
    )
  })
})

describe('the error of each field, said with its own words', () => {
  it('an empty quantity says grams or units', () => {
    expect(quantityErrorMessage('REQUIRED', 'grams')).toBe(
      'Poné cuántos gramos comiste.',
    )
    expect(quantityErrorMessage('REQUIRED', 'units')).toBe(
      'Poné cuántas unidades comiste.',
    )
  })

  it.each<PositiveNumberError>(['INVALID_NUMBER', 'NOT_POSITIVE'])(
    'a quantity with %s says what any number field says',
    (code) => {
      expect(quantityErrorMessage(code, 'grams')).toBe(
        positiveNumberErrorMessage(code),
      )
      expect(quantityErrorMessage(code, 'units')).toBe(
        positiveNumberErrorMessage(code),
      )
    },
  )

  it('the applied dose: empty says it can be 0', () => {
    expect(appliedDoseErrorMessage('REQUIRED')).toBe(
      'Poné cuánto te aplicaste. Puede ser 0.',
    )
    expect(appliedDoseErrorMessage('INVALID_NUMBER')).toBe(
      positiveNumberErrorMessage('INVALID_NUMBER'),
    )
  })

  it('the ratio', () => {
    expect(ratioErrorMessage('REQUIRED')).toBe('Poné tu ratio.')
    expect(ratioErrorMessage('INVALID_NUMBER')).toBe(
      positiveNumberErrorMessage('INVALID_NUMBER'),
    )
    expect(ratioErrorMessage('NOT_POSITIVE')).toBe('Tiene que ser mayor que 0.')
  })

  it('the name of a food', () => {
    expect(foodFieldErrorMessage('NAME_REQUIRED')).toBe(
      'Poné el nombre del alimento.',
    )
  })

  it.each<[RequiredFoodField, string]>([
    ['carbsPer100g', 'Poné cuántos g de HC tiene cada 100 g.'],
    ['rawWeight', 'Poné el peso crudo.'],
    ['cookedWeight', 'Poné el peso cocido.'],
    ['portion', 'Poné cuántos gramos es la porción.'],
    ['portionCarbs', 'Poné cuántos g de HC tiene la porción.'],
  ])('an empty %s says what to write', (field, message) => {
    expect(foodFieldErrorMessage('REQUIRED', field)).toBe(message)
  })

  it('each food field has its own message when empty', () => {
    const fields: RequiredFoodField[] = [
      'carbsPer100g',
      'rawWeight',
      'cookedWeight',
      'portion',
      'portionCarbs',
    ]
    const messages = fields.map((field) =>
      foodFieldErrorMessage('REQUIRED', field),
    )
    expect(new Set(messages).size).toBe(fields.length)
  })

  it('the field only changes an empty field', () => {
    expect(foodFieldErrorMessage('NOT_POSITIVE', 'rawWeight')).toBe(
      'Tiene que ser mayor que 0.',
    )
    expect(foodFieldErrorMessage('ABOVE_100', 'carbsPer100g')).toBe(
      'No puede ser más de 100 g cada 100 g.',
    )
  })
})

describe('mealProblemMessage', () => {
  it.each<[MealProblem, string]>([
    [
      { code: 'QUANTITY', foodName: 'Banana', error: 'REQUIRED' },
      'Falta la cantidad de Banana.',
    ],
    [
      { code: 'QUANTITY', foodName: 'Banana', error: 'INVALID_NUMBER' },
      'Revisá la cantidad de Banana.',
    ],
    [
      { code: 'QUANTITY', foodName: 'Banana', error: 'NOT_POSITIVE' },
      'Revisá la cantidad de Banana.',
    ],
    [{ code: 'FOOD', foodName: 'Fideos' }, 'Revisá Fideos.'],
    [{ code: 'APPLIED_DOSE', error: 'REQUIRED' }, 'Falta cuánto te aplicaste.'],
    [
      { code: 'APPLIED_DOSE', error: 'INVALID_NUMBER' },
      'Revisá cuánto te aplicaste.',
    ],
    [{ code: 'EATEN_AT', empty: true }, 'Falta la fecha y la hora.'],
    [{ code: 'EATEN_AT', empty: false }, 'Revisá la fecha y la hora.'],
    [{ code: 'MEAL' }, 'Corregí los datos marcados para poder guardar.'],
  ])('%o → %s', (problem, message) => {
    expect(mealProblemMessage(problem)).toBe(message)
  })
})

describe('visionErrorMessage', () => {
  it('uses the texts of spec §9.3', () => {
    expect(visionErrorMessage('VISION_QUOTA_EXCEEDED')).toBe(
      'Se alcanzó el límite gratuito de lecturas de etiquetas. Podés cargar los datos a mano o probar de nuevo más tarde.',
    )
    expect(visionErrorMessage('DAILY_CAP_REACHED')).toBe(
      'Llegaste al máximo de lecturas automáticas de hoy. Podés cargar los datos a mano.',
    )
    expect(visionErrorMessage('VISION_UNAVAILABLE')).toBe(
      'El servicio de lectura no responde en este momento. Podés cargar los datos a mano o reintentar.',
    )
    expect(visionErrorMessage('VISION_BAD_RESPONSE')).toBe(
      'No se pudo interpretar la lectura de la etiqueta. Podés cargar los datos a mano o reintentar.',
    )
    expect(visionErrorMessage('INVALID_REQUEST')).toBe(
      'No se pudo leer la foto. Podés sacar otra o cargar los datos a mano.',
    )
  })

  it('a VisionError keeps its code and retryable', () => {
    const error = new VisionError('VISION_QUOTA_EXCEEDED', true)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('VISION_QUOTA_EXCEEDED')
    expect(error.retryable).toBe(true)
  })
})
