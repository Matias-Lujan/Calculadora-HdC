import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { DAILY_CAP, startOfToday } from './dailyCap.ts'
import { readLabel } from './readLabel.ts'

// HTTP entry point of transcribe-label (docs/spec.md §9.3). The only file that
// uses Deno; the logic it calls is tested with Vitest. Logs carry technical
// codes only, never health data nor provider messages.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Error codes of the HTTP contract (spec §9.3). */
const ERRORS = {
  VISION_QUOTA_EXCEEDED: { status: 429, retryable: true },
  DAILY_CAP_REACHED: { status: 429, retryable: false },
  VISION_UNAVAILABLE: { status: 503, retryable: true },
  VISION_BAD_RESPONSE: { status: 502, retryable: true },
  INVALID_REQUEST: { status: 400, retryable: false },
  UNAUTHORIZED: { status: 401, retryable: false },
  INTERNAL_ERROR: { status: 500, retryable: true },
} as const

type ErrorCode = keyof typeof ERRORS

const PROVIDER_TIMEOUT_MS = 30_000

/** Storage statuses for a foreign or missing path (RLS hides foreign files). */
const CLIENT_DOWNLOAD_ERRORS = new Set([400, 403, 404])

const requestSchema = z.object({ storage_path: z.string() })

/** SUPABASE_PUBLISHABLE_KEYS is injected by the platform as `{"default": "<key>"}`. */
const publishableKeysSchema = z.object({ default: z.string().min(1) })

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

function fail(code: ErrorCode): Response {
  const { status, retryable } = ERRORS[code]
  return json(status, { ok: false, error: { code, retryable } })
}

function internalError(reason: string): Response {
  console.error(`transcribe-label: ${reason}`)
  return fail('INTERNAL_ERROR')
}

function publishableKey(): string | null {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (raw === undefined) return null
  try {
    const keys = publishableKeysSchema.safeParse(JSON.parse(raw))
    return keys.success ? keys.data.default : null
  } catch {
    return null
  }
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') return fail('INVALID_REQUEST')

  // Auth: the user's JWT. Every query below runs as the user, so RLS applies.
  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]
  if (authorization === null || token === undefined) {
    return fail('UNAUTHORIZED')
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = publishableKey()
  if (supabaseUrl === undefined || supabaseKey === null) {
    return internalError('MISSING_SUPABASE_ENV')
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims(token)
  const userId = claimsData?.claims.sub
  if (claimsError !== null || typeof userId !== 'string' || userId === '') {
    return fail('UNAUTHORIZED')
  }

  // The path must be inside the user's folder (spec §7.4).
  const body = requestSchema.safeParse(await readBody(request))
  if (!body.success || !body.data.storage_path.startsWith(`${userId}/`)) {
    return fail('INVALID_REQUEST')
  }
  const storagePath = body.data.storage_path

  // 1. Daily cap: readings since midnight in Buenos Aires.
  const { count, error: countError } = await supabase
    .from('vision_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfToday(new Date()))
  if (countError !== null || count === null) {
    return internalError('COUNT_FAILED')
  }
  if (count >= DAILY_CAP) return fail('DAILY_CAP_REACHED')

  // 2. Download with the user's client, so Storage RLS applies too.
  const { data: file, error: downloadError } = await supabase.storage
    .from('food-photos')
    .download(storagePath)
  if (downloadError !== null) {
    // StorageApiError carries the HTTP status; a network failure
    // (StorageUnknownError) has none. Only a foreign or missing path is the
    // client's fault; anything else may be momentary and can be retried.
    return CLIENT_DOWNLOAD_ERRORS.has(downloadError.status ?? 0)
      ? fail('INVALID_REQUEST')
      : internalError('DOWNLOAD_FAILED')
  }
  const image = new Uint8Array(await file.arrayBuffer())

  // 3 and 4. Provider call (with its single retry) and zod validation.
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const model = Deno.env.get('GEMINI_MODEL')
  if (!apiKey || !model) return internalError('MISSING_GEMINI_ENV')
  const result = await readLabel(image, {
    apiKey,
    model,
    fetch,
    timeoutMs: PROVIDER_TIMEOUT_MS,
  })

  // 5. Log the reading. If it fails, the user still gets the answer.
  const { error: insertError } = await supabase
    .from('vision_requests')
    .insert({ status: result.ok ? 'ok' : result.code })
  if (insertError !== null) {
    console.error('transcribe-label: INSERT_FAILED')
  }

  // 6. Answer.
  if (!result.ok) return fail(result.code)
  return json(200, { ok: true, transcription: result.transcription })
}

Deno.serve(async (request) => {
  try {
    return await handle(request)
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown'
    return internalError(`UNEXPECTED_EXCEPTION ${name}`)
  }
})
