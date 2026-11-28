import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  EMPTY_STATE,
  LATEST_ERROR_CODES,
  latestGlucose,
  type LatestResult,
  type LibreState,
} from './latest.ts'
import {
  readGraph,
  type LibreCredentials,
  type LibreSession,
} from './provider.ts'
import {
  cutoffIso,
  isTaskRequest,
  readingsToKeep,
  shouldSyncGraph,
} from './sync.ts'

// HTTP entry point of glucose-latest (docs/spec.md §9.8). The only file that
// uses Deno; the logic it calls is tested with Vitest. Logs carry technical
// codes only: never the email, the password, the token nor a glucose value.
// Two modes: the app (the user's JWT) and the scheduled sync (the secret
// key in the apikey header), which only saves the graph.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Error codes of the HTTP contract (spec §9.8). */
const ERRORS = {
  GLUCOSE_NOT_CONFIGURED: { status: 503, retryable: false },
  GLUCOSE_LOGIN_FAILED: { status: 502, retryable: false },
  GLUCOSE_ACTION_NEEDED: { status: 502, retryable: false },
  GLUCOSE_NOT_SHARED: { status: 502, retryable: false },
  GLUCOSE_UNAVAILABLE: { status: 503, retryable: true },
  INVALID_REQUEST: { status: 400, retryable: false },
  UNAUTHORIZED: { status: 401, retryable: false },
  INTERNAL_ERROR: { status: 500, retryable: true },
} as const

type ErrorCode = keyof typeof ERRORS

/**
 * Each call to LibreLinkUp; a call to this function makes four at most
 * (two when it also reads the graph, because then it does not log in).
 */
const PROVIDER_TIMEOUT_MS = 10_000

/** The platform injects the keys as `{"default": "<key>"}`. */
const keysSchema = z.object({ default: z.string().min(1) })

const sessionRowSchema = z.object({
  api_url: z.string().nullable(),
  token: z.string().nullable(),
  account_id_hash: z.string().nullable(),
  expires_at: z.string().nullable(),
  login_after: z.string().nullable(),
  login_error: z.string().nullable(),
  graph_synced_at: z.string().nullable(),
})

type SessionRow = z.infer<typeof sessionRowSchema>

const SESSION_COLUMNS =
  'api_url, token, account_id_hash, expires_at, login_after, login_error, graph_synced_at'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

/** retryAt (ms): while waiting after a failed login, sent as retry_at. */
function fail(code: ErrorCode, retryAt?: number): Response {
  const { status, retryable } = ERRORS[code]
  const error =
    retryAt === undefined
      ? { code, retryable }
      : { code, retryable, retry_at: new Date(retryAt).toISOString() }
  return json(status, { ok: false, error })
}

function internalError(reason: string): Response {
  console.error(`glucose-latest: ${reason}`)
  return fail('INTERNAL_ERROR')
}

function platformKey(name: string): string | null {
  const raw = Deno.env.get(name)
  if (raw === undefined) return null
  try {
    const keys = keysSchema.safeParse(JSON.parse(raw))
    return keys.success ? keys.data.default : null
  } catch {
    return null
  }
}

function toMs(value: string | null): number | null {
  if (value === null) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** The row as the state of latest.ts. A broken session counts as none. */
function toState(row: SessionRow | null): LibreState {
  if (row === null) return EMPTY_STATE
  const expiresAt = toMs(row.expires_at)
  const loginError = LATEST_ERROR_CODES.find((code) => code === row.login_error)
  return {
    session:
      row.api_url !== null &&
      row.token !== null &&
      row.account_id_hash !== null &&
      expiresAt !== null
        ? {
            apiUrl: row.api_url,
            token: row.token,
            accountIdHash: row.account_id_hash,
            expiresAt,
          }
        : null,
    loginAfter: toMs(row.login_after),
    loginError: loginError ?? null,
  }
}

/**
 * The row to save. Without graph_synced_at: an upsert only changes the
 * columns it sends, so the time of the last graph is kept.
 */
function toRow(userId: string, state: LibreState) {
  const { session } = state
  return {
    user_id: userId,
    api_url: session?.apiUrl ?? null,
    token: session?.token ?? null,
    account_id_hash: session?.accountIdHash ?? null,
    expires_at:
      session === null ? null : new Date(session.expiresAt).toISOString(),
    login_after:
      state.loginAfter === null
        ? null
        : new Date(state.loginAfter).toISOString(),
    login_error: state.loginError,
  }
}

/** Saves the graph of LibreLinkUp and deletes what is older than 24 h. */
async function syncGraph(
  admin: SupabaseClient,
  userId: string,
  session: LibreSession,
  patientId: string,
  now: number,
): Promise<void> {
  console.log('glucose-latest: GRAPH')
  const graph = await readGraph(session, patientId, {
    fetch,
    timeoutMs: PROVIDER_TIMEOUT_MS,
  })
  // A 401 here does not log in again: the next read does it, if needed.
  if (!graph.ok) {
    console.error(`glucose-latest: GRAPH_FAILED ${graph.error}`)
    return
  }
  const readings = readingsToKeep(graph.readings, now)
  if (readings.length > 0) {
    const { error } = await admin.from('glucose_readings').upsert(
      readings.map((reading) => ({ user_id: userId, ...reading })),
      { onConflict: 'user_id,measured_at', ignoreDuplicates: true },
    )
    if (error !== null) {
      console.error('glucose-latest: GRAPH_SAVE_FAILED')
      return
    }
  }
  const { error: deleteError } = await admin
    .from('glucose_readings')
    .delete()
    .eq('user_id', userId)
    .lt('measured_at', cutoffIso(now))
  if (deleteError !== null) {
    console.error('glucose-latest: GRAPH_SAVE_FAILED')
    return
  }
  const { error: markError } = await admin
    .from('libre_sessions')
    .upsert(
      { user_id: userId, graph_synced_at: new Date(now).toISOString() },
      { onConflict: 'user_id' },
    )
  if (markError !== null) console.error('glucose-latest: GRAPH_SAVE_FAILED')
}

/**
 * What both modes do: reads libre_sessions, gets the last reading (logging
 * in if needed), saves the session and, every 15 min, the graph. A Response
 * is an internal error to answer as is.
 */
async function loadAndRun(
  admin: SupabaseClient,
  userId: string,
  now: number,
  credentials: LibreCredentials,
): Promise<LatestResult | Response> {
  const { data: rowData, error: readError } = await admin
    .from('libre_sessions')
    .select(SESSION_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  if (readError !== null) return internalError('SESSION_READ_FAILED')
  const row = sessionRowSchema.nullable().safeParse(rowData)
  if (!row.success) return internalError('SESSION_ROW_INVALID')

  const outcome = await latestGlucose(toState(row.data), now, credentials, {
    fetch,
    timeoutMs: PROVIDER_TIMEOUT_MS,
  })
  for (const event of outcome.events) console.log(`glucose-latest: ${event}`)

  // If saving fails, the user still gets the answer.
  if (outcome.changed) {
    const { error: saveError } = await admin
      .from('libre_sessions')
      .upsert(toRow(userId, outcome.state), { onConflict: 'user_id' })
    if (saveError !== null) console.error('glucose-latest: SAVE_FAILED')
  }

  // The graph only in a call that did not log in, so a call never makes
  // more than the four calls the app waits for (spec §9.8). Its failures
  // do not change the answer.
  const graph = shouldSyncGraph(
    outcome,
    toMs(row.data?.graph_synced_at ?? null),
    now,
  )
  if (graph !== null) {
    await syncGraph(admin, userId, graph.session, graph.patientId, now)
  }
  return outcome.result
}

function adminClient(supabaseUrl: string, secretKey: string): SupabaseClient {
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** The Libre secrets, or null if one is missing. */
function libreSecrets(): {
  credentials: LibreCredentials
  appUserId: string
} | null {
  const email = Deno.env.get('LIBRE_EMAIL')
  const password = Deno.env.get('LIBRE_PASSWORD')
  const appUserId = Deno.env.get('LIBRE_APP_USER_ID')
  if (!email || !password || !appUserId) return null
  return { credentials: { email, password }, appUserId }
}

/**
 * The scheduled sync (pg_cron, with the secret key and no JWT): the same
 * as a call of the enabled user, without the glucose in the answer.
 */
async function handleTask(secretKey: string): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (supabaseUrl === undefined) return internalError('MISSING_SUPABASE_ENV')
  const secrets = libreSecrets()
  if (secrets === null) return fail('GLUCOSE_NOT_CONFIGURED')

  const result = await loadAndRun(
    adminClient(supabaseUrl, secretKey),
    secrets.appUserId,
    Date.now(),
    secrets.credentials,
  )
  if (result instanceof Response) return result
  if (!result.ok) return fail(result.code, result.retryAt)
  return json(200, { ok: true })
}

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') return fail('INVALID_REQUEST')

  // The function is deployed without the platform's JWT check: the
  // scheduled sync sends the secret key; anything else needs a user.
  const secretKey = platformKey('SUPABASE_SECRET_KEYS')
  if (
    secretKey !== null &&
    isTaskRequest(request.headers.get('apikey'), secretKey)
  ) {
    return handleTask(secretKey)
  }

  // Auth: the user's JWT.
  const authorization = request.headers.get('Authorization')
  const jwt = authorization?.match(/^Bearer (.+)$/)?.[1]
  if (authorization === null || jwt === undefined) {
    return fail('UNAUTHORIZED')
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = platformKey('SUPABASE_PUBLISHABLE_KEYS')
  if (supabaseUrl === undefined || publishableKey === null) {
    return internalError('MISSING_SUPABASE_ENV')
  }
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: claimsData, error: claimsError } =
    await userClient.auth.getClaims(jwt)
  const userId = claimsData?.claims.sub
  if (claimsError !== null || typeof userId !== 'string' || userId === '') {
    return fail('UNAUTHORIZED')
  }

  // Until M9, only one user of the app sees the glucose: the one whose id is
  // in LIBRE_APP_USER_ID, with the LibreLink account of the secrets.
  const secrets = libreSecrets()
  if (secrets === null || userId !== secrets.appUserId) {
    return fail('GLUCOSE_NOT_CONFIGURED')
  }

  // libre_sessions has no policies: only the secret key reads and writes it.
  if (secretKey === null) return internalError('MISSING_SECRET_KEY')
  const result = await loadAndRun(
    adminClient(supabaseUrl, secretKey),
    userId,
    Date.now(),
    secrets.credentials,
  )
  if (result instanceof Response) return result
  if (!result.ok) return fail(result.code, result.retryAt)
  return json(200, { ok: true, reading: result.reading })
}

Deno.serve(async (request) => {
  try {
    return await handle(request)
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown'
    return internalError(`UNEXPECTED_EXCEPTION ${name}`)
  }
})
