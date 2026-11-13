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
  LOAD_ERROR_MESSAGE,
  SAVE_ERROR_MESSAGE,
  SIGN_OUT_ERROR_MESSAGE,
  authErrorMessage,
  cookingFactorUnusualMessage,
  foodFieldErrorMessage,
  isUnauthorized,
  type FoodFieldError,
  positiveNumberErrorMessage,
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

  it.each([null, undefined, 'PGRST301', 401, new Error('x')])(
    'is false for non-error value %#',
    (value) => {
      expect(isUnauthorized(value)).toBe(false)
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
    SIGN_OUT_ERROR_MESSAGE,
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
    const messages = codes.map(foodFieldErrorMessage)
    expect(new Set(messages).size).toBe(messages.length)
  })

  it.each<[FoodFieldError, string]>([
    ['REQUIRED', 'Completá este campo.'],
    ['ABOVE_100', 'No puede ser más de 100 g cada 100 g.'],
    ['STATE_REQUIRED', 'Elegí una opción.'],
    [
      'UNIT_WEIGHT_REQUIRED',
      'Completá el peso de la unidad, o borrá el nombre.',
    ],
    [
      'FACTOR_NOT_COMPUTABLE',
      'Con estos pesos no se puede calcular el factor. Revisalos.',
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
  it('includes the formatted factor', () => {
    const message = cookingFactorUnusualMessage('0,90')
    expect(message).toContain('0,90')
    expect(message).toBe(
      'El factor de cocción da 0,90, fuera de lo habitual (entre 1 y 4). Puede ser un error de tipeo. ¿Lo guardás igual?',
    )
  })
})
