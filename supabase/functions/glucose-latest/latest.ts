import type { GlucoseReading } from './contract.ts'
import {
  login,
  readLatest,
  type LibreConfig,
  type LibreCredentials,
  type LibreSession,
  type ProviderError,
} from './provider.ts'

// What glucose-latest does on each call (docs/spec.md §9.8), without Deno nor
// the database: it reads with the kept session and logs in only when there
// is none, it expired or LibreLinkUp rejects it. After a failed login it
// waits before trying again, because Abbott locks the account after many
// logins. index.ts reads and saves the state in libre_sessions.

/** The expected errors of the HTTP contract (§9.8) this file can give. */
export type LatestErrorCode =
  | 'GLUCOSE_LOGIN_FAILED'
  | 'GLUCOSE_ACTION_NEEDED'
  | 'GLUCOSE_NOT_SHARED'
  | 'GLUCOSE_UNAVAILABLE'

export const LATEST_ERROR_CODES: readonly LatestErrorCode[] = [
  'GLUCOSE_LOGIN_FAILED',
  'GLUCOSE_ACTION_NEEDED',
  'GLUCOSE_NOT_SHARED',
  'GLUCOSE_UNAVAILABLE',
]

/** The row of libre_sessions, with times in ms since the epoch. */
export interface LibreState {
  session: LibreSession | null
  /** After a failed login, no new login before this time. */
  loginAfter: number | null
  /** The code that failed login gave, answered while waiting. */
  loginError: LatestErrorCode | null
}

export type LatestResult =
  | { ok: true; reading: GlucoseReading | null }
  /** retryAt: while waiting after a failed login, when it logs in again. */
  | { ok: false; code: LatestErrorCode; retryAt?: number }

export interface LatestOutcome {
  result: LatestResult
  /** The state to keep; it only has to be saved if `changed`. */
  state: LibreState
  changed: boolean
  /** Technical events for the logs: codes only, never values nor secrets. */
  events: string[]
}

/** The shortest wait after a failed login. */
export const LOGIN_WAIT_MS = 15 * 60 * 1000

export const EMPTY_STATE: LibreState = {
  session: null,
  loginAfter: null,
  loginError: null,
}

function errorCode(error: ProviderError): LatestErrorCode {
  switch (error) {
    case 'BAD_CREDENTIALS':
      return 'GLUCOSE_LOGIN_FAILED'
    case 'ACCOUNT_ACTION_REQUIRED':
      return 'GLUCOSE_ACTION_NEEDED'
    case 'NO_CONNECTION':
      return 'GLUCOSE_NOT_SHARED'
    case 'LOCKED':
    case 'CLIENT_REJECTED':
    case 'SESSION_EXPIRED':
    case 'UNAVAILABLE':
    case 'BAD_RESPONSE':
      return 'GLUCOSE_UNAVAILABLE'
  }
}

/**
 * The answer and the state after a failed login: no session, and a wait;
 * the answer says when it logs in again.
 */
function waiting(
  now: number,
  code: LatestErrorCode,
  retryAfterSeconds?: number,
): { result: LatestResult; state: LibreState } {
  const wait = Math.max(LOGIN_WAIT_MS, (retryAfterSeconds ?? 0) * 1000)
  const loginAfter = now + wait
  return {
    result: { ok: false, code, retryAt: loginAfter },
    state: { session: null, loginAfter, loginError: code },
  }
}

export async function latestGlucose(
  state: LibreState,
  now: number,
  credentials: LibreCredentials,
  config: LibreConfig,
): Promise<LatestOutcome> {
  const events: string[] = []
  const session =
    state.session !== null && state.session.expiresAt > now
      ? state.session
      : null

  if (session !== null) {
    const read = await readLatest(session, config)
    if (read.ok) {
      return { result: read, state, changed: false, events }
    }
    events.push(`READ_FAILED ${read.error}`)
    // Any other error keeps the session: it may be momentary.
    if (read.error !== 'SESSION_EXPIRED') {
      return {
        result: { ok: false, code: errorCode(read.error) },
        state,
        changed: false,
        events,
      }
    }
  } else if (state.loginAfter !== null && state.loginAfter > now) {
    // Still waiting after a failed login: no call at all.
    return {
      result: {
        ok: false,
        code: state.loginError ?? 'GLUCOSE_UNAVAILABLE',
        retryAt: state.loginAfter,
      },
      state,
      changed: false,
      events,
    }
  }

  events.push('LOGIN')
  const logged = await login(credentials, config)
  if (!logged.ok) {
    const code = errorCode(logged.error)
    events.push(`LOGIN_FAILED ${logged.error}`)
    return {
      ...waiting(now, code, logged.retryAfterSeconds),
      changed: true,
      events,
    }
  }

  const fresh: LibreState = {
    session: logged.session,
    loginAfter: null,
    loginError: null,
  }
  const read = await readLatest(logged.session, config)
  if (read.ok) return { result: read, state: fresh, changed: true, events }
  events.push(`READ_FAILED ${read.error}`)
  if (read.error === 'SESSION_EXPIRED') {
    // A session just given is rejected: logging in again on every call
    // could lock the account, so it waits as after a failed login.
    return {
      ...waiting(now, 'GLUCOSE_UNAVAILABLE'),
      changed: true,
      events,
    }
  }
  return {
    result: { ok: false, code: errorCode(read.error) },
    state: fresh,
    changed: true,
    events,
  }
}
