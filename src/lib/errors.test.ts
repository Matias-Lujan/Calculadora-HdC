import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
  PostgrestError,
} from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { authErrorMessage, isUnauthorized } from './errors.ts'

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
