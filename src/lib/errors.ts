import {
  isAuthApiError,
  isAuthRetryableFetchError,
} from '@supabase/supabase-js'

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
