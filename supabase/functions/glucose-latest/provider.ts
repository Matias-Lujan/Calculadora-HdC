import { z } from 'zod'
import type { GlucoseReading, GlucoseTrend } from './contract.ts'

// The ONLY file that knows the glucose comes from LibreLinkUp, Abbott's
// unofficial API (docs/spec.md §9.8). It does not read secrets nor log
// anything: the credentials, the session and fetch come as parameters, so it
// can be tested with Vitest and a fake fetch.

export type ProviderError =
  | 'BAD_CREDENTIALS' // wrong email or password
  | 'ACCOUNT_ACTION_REQUIRED' // the account has to accept terms or verify its email
  | 'LOCKED' // too many logins: Abbott asks to wait
  | 'CLIENT_REJECTED' // Abbott does not accept this client (version, headers)
  | 'SESSION_EXPIRED' // the token is no longer valid: log in again
  | 'NO_CONNECTION' // the account follows nobody (sharing is off)
  | 'UNAVAILABLE' // 5xx, network error or timeout
  | 'BAD_RESPONSE' // an answer of another shape

export interface LibreCredentials {
  email: string
  password: string
}

export interface LibreConfig {
  fetch: typeof fetch
  timeoutMs: number
}

/** What a login gives, kept to read without logging in again. */
export interface LibreSession {
  /** The regional API the account belongs to. */
  apiUrl: string
  token: string
  /** sha256 of the account id, in hex: LibreLinkUp asks for it on every read. */
  accountIdHash: string
  /** When the token expires, in ms since the epoch. */
  expiresAt: number
}

export type LoginResult =
  | { ok: true; session: LibreSession }
  | { ok: false; error: ProviderError; retryAfterSeconds?: number }

export type ReadResult =
  | { ok: true; reading: GlucoseReading | null }
  | { ok: false; error: ProviderError }

const DEFAULT_API_URL = 'https://api.libreview.io'

// LibreLinkUp rejects (status 920) clients that do not say they are a
// recent version of its app.
const BASE_HEADERS = {
  product: 'llu.android',
  version: '4.16.0',
  'content-type': 'application/json',
  accept: 'application/json',
  'cache-control': 'no-cache',
}

/** Regions LibreLinkUp redirects to ("eu", "us", "eu2"…). */
const REGION = /^[a-z]{2}[0-9]?$/

/** The steps of status 4 that the account owner has to do in the app. */
const ACCOUNT_STEPS = new Set(['tou', 'pp', 'verifyEmail'])

const TRENDS: Record<number, GlucoseTrend> = {
  1: 'falling_fast',
  2: 'falling',
  3: 'steady',
  4: 'rising',
  5: 'rising_fast',
}

type HttpAnswer =
  | { ok: true; status: number; retryAfter: string | null; body: unknown }
  | { ok: false }

/** One call. A network error or a timeout gives { ok: false }. */
async function call(
  url: string,
  init: {
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: string
  },
  config: LibreConfig,
): Promise<HttpAnswer> {
  try {
    const response = await config.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    const text = await response.text()
    let body: unknown = undefined
    try {
      body = JSON.parse(text) as unknown
    } catch {
      // Not JSON: left undefined, so it does not match any shape.
    }
    return {
      ok: true,
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
      body,
    }
  } catch {
    return { ok: false }
  }
}

/** Retry-After in seconds; an HTTP date or anything else gives undefined. */
function retryAfterSeconds(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) return undefined
  return Number(header.trim())
}

/**
 * The errors told by the HTTP status, before reading the body. Returns null
 * for a 2xx.
 */
function httpError(
  answer: Extract<HttpAnswer, { ok: true }>,
): { error: ProviderError; retryAfterSeconds?: number } | null {
  const { status } = answer
  if (status >= 200 && status < 300) return null
  if (status === 429) {
    const seconds = retryAfterSeconds(answer.retryAfter)
    return seconds === undefined
      ? { error: 'LOCKED' }
      : { error: 'LOCKED', retryAfterSeconds: seconds }
  }
  if (status === 403) return { error: 'CLIENT_REJECTED' }
  if (status >= 500) return { error: 'UNAVAILABLE' }
  return { error: 'BAD_RESPONSE' }
}

const statusSchema = z.object({ status: z.number() })

const loginOkSchema = z.object({
  status: z.literal(0),
  data: z.object({
    user: z.object({ id: z.string().min(1) }),
    authTicket: z.object({
      token: z.string().min(1),
      expires: z.number().positive(),
    }),
  }),
})

const redirectSchema = z.object({
  status: z.literal(0),
  data: z.object({ redirect: z.literal(true), region: z.string() }),
})

const stepSchema = z.object({
  status: z.literal(4),
  data: z.object({ step: z.object({ type: z.string() }) }),
})

const lockoutSchema = z.object({
  status: z.literal(429),
  data: z.object({ data: z.object({ lockout: z.number().nonnegative() }) }),
})

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

type LoginAttempt = LoginResult | { ok: 'redirect'; region: string }

async function loginAt(
  apiUrl: string,
  credentials: LibreCredentials,
  config: LibreConfig,
): Promise<LoginAttempt> {
  const answer = await call(
    `${apiUrl}/llu/auth/login`,
    {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    },
    config,
  )
  if (!answer.ok) return { ok: false, error: 'UNAVAILABLE' }
  const failed = httpError(answer)
  if (failed !== null) return { ok: false, ...failed }

  const status = statusSchema.safeParse(answer.body)
  if (!status.success) return { ok: false, error: 'BAD_RESPONSE' }
  switch (status.data.status) {
    case 0: {
      const redirect = redirectSchema.safeParse(answer.body)
      if (redirect.success) {
        return { ok: 'redirect', region: redirect.data.data.region }
      }
      const login = loginOkSchema.safeParse(answer.body)
      if (!login.success) return { ok: false, error: 'BAD_RESPONSE' }
      const { user, authTicket } = login.data.data
      return {
        ok: true,
        session: {
          apiUrl,
          token: authTicket.token,
          accountIdHash: await sha256Hex(user.id),
          expiresAt: authTicket.expires * 1000,
        },
      }
    }
    case 2:
      return { ok: false, error: 'BAD_CREDENTIALS' }
    case 4: {
      // Terms, privacy policy or email: never accepted from here, the account holder
      // does it in the LibreLinkUp app.
      const step = stepSchema.safeParse(answer.body)
      return step.success && ACCOUNT_STEPS.has(step.data.data.step.type)
        ? { ok: false, error: 'ACCOUNT_ACTION_REQUIRED' }
        : { ok: false, error: 'BAD_RESPONSE' }
    }
    case 429: {
      const lockout = lockoutSchema.safeParse(answer.body)
      return lockout.success
        ? {
            ok: false,
            error: 'LOCKED',
            retryAfterSeconds: lockout.data.data.data.lockout,
          }
        : { ok: false, error: 'LOCKED' }
    }
    case 920:
      return { ok: false, error: 'CLIENT_REJECTED' }
    default:
      return { ok: false, error: 'BAD_RESPONSE' }
  }
}

/**
 * Logs in to LibreLinkUp. If the account belongs to another region, it
 * logs in again there, once; a second redirect is a bad response.
 */
export async function login(
  credentials: LibreCredentials,
  config: LibreConfig,
): Promise<LoginResult> {
  const first = await loginAt(DEFAULT_API_URL, credentials, config)
  if (first.ok !== 'redirect') return first
  if (!REGION.test(first.region)) return { ok: false, error: 'BAD_RESPONSE' }
  const second = await loginAt(
    `https://api-${first.region}.libreview.io`,
    credentials,
    config,
  )
  if (second.ok === 'redirect') return { ok: false, error: 'BAD_RESPONSE' }
  return second
}

const measurementSchema = z.object({
  ValueInMgPerDl: z.number().int().positive(),
  TrendArrow: z.unknown().optional(),
  FactoryTimestamp: z.string(),
})

const connectionsSchema = z.object({
  data: z.array(
    z.object({
      // Missing or null when the sensor has no reading right now.
      glucoseMeasurement: z.unknown().optional(),
    }),
  ),
})

const TIMESTAMP =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/

/**
 * FactoryTimestamp is UTC, written "11/27/2026 3:05:12 PM". Returns ISO, or
 * null if it is not a real date and time.
 */
function parseFactoryTimestamp(text: string): string | null {
  const match = TIMESTAMP.exec(text.trim())
  if (match === null) return null
  const part = (index: number) => Number(match[index])
  const month = part(1)
  const day = part(2)
  const year = part(3)
  const hour12 = part(4)
  const minute = part(5)
  const second = part(6)
  const isPm = match[7] === 'PM'
  if (hour12 < 1 || hour12 > 12 || minute > 59 || second > 59) return null
  // 12 AM is midnight and 12 PM is noon.
  const hour = (hour12 % 12) + (isPm ? 12 : 0)
  const ms = Date.UTC(year, month - 1, day, hour, minute, second)
  const date = new Date(ms)
  // Date.UTC rolls over (2/30 → 3/2): a date that changed is not real.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date.toISOString()
}

/**
 * Reads the last reading of the first connection (the account the user
 * follows; with the main account following itself, its own sensor).
 */
export async function readLatest(
  session: LibreSession,
  config: LibreConfig,
): Promise<ReadResult> {
  const answer = await call(
    `${session.apiUrl}/llu/connections`,
    {
      method: 'GET',
      headers: {
        ...BASE_HEADERS,
        authorization: `Bearer ${session.token}`,
        'account-id': session.accountIdHash,
      },
    },
    config,
  )
  if (!answer.ok) return { ok: false, error: 'UNAVAILABLE' }
  if (answer.status === 401) return { ok: false, error: 'SESSION_EXPIRED' }
  const failed = httpError(answer)
  if (failed !== null) return { ok: false, error: failed.error }

  const status = statusSchema.safeParse(answer.body)
  if (status.success && status.data.status === 920) {
    return { ok: false, error: 'CLIENT_REJECTED' }
  }
  const connections = connectionsSchema.safeParse(answer.body)
  if (!connections.success) return { ok: false, error: 'BAD_RESPONSE' }
  const first = connections.data.data[0]
  if (first === undefined) return { ok: false, error: 'NO_CONNECTION' }
  if (
    first.glucoseMeasurement === undefined ||
    first.glucoseMeasurement === null
  ) {
    return { ok: true, reading: null }
  }

  const measurement = measurementSchema.safeParse(first.glucoseMeasurement)
  if (!measurement.success) return { ok: false, error: 'BAD_RESPONSE' }
  const measuredAt = parseFactoryTimestamp(measurement.data.FactoryTimestamp)
  if (measuredAt === null) return { ok: false, error: 'BAD_RESPONSE' }
  const arrow = measurement.data.TrendArrow
  return {
    ok: true,
    reading: {
      mgdl: measurement.data.ValueInMgPerDl,
      trend: typeof arrow === 'number' ? (TRENDS[arrow] ?? null) : null,
      measured_at: measuredAt,
    },
  }
}
