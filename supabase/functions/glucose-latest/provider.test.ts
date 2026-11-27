import { describe, expect, it, vi } from 'vitest'
import {
  login,
  readLatest,
  type LibreConfig,
  type LibreSession,
} from './provider.ts'

// Invented data only. The fake fetch stands in for LibreLinkUp.

const CREDENTIALS = { email: 'prueba@example.test', password: 'clave-falsa' }
const ACCOUNT_ID = 'cuenta-inventada-123'
/** sha256 of ACCOUNT_ID, in hex. */
const ACCOUNT_ID_HASH =
  'a352389cf232c5dbfa87c795fdbe52ff9795b9fce3ba9f9bead86f68a86ab277'

function config(fetchMock: typeof fetch, timeoutMs = 5000): LibreConfig {
  return { fetch: fetchMock, timeoutMs }
}

function answer(body: unknown, status = 200, headers = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers,
  })
}

const LOGIN_OK = {
  status: 0,
  data: {
    user: { id: ACCOUNT_ID },
    authTicket: { token: 'token-inventado', expires: 1_800_000_000 },
  },
}

/** A fetch that never answers and rejects when its signal aborts. */
const hangingFetch: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    )
  })

describe('login', () => {
  it('con una respuesta válida devuelve la sesión y arma bien el pedido', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => answer(LOGIN_OK))
    const result = await login(CREDENTIALS, config(fetchMock))

    expect(result).toEqual({
      ok: true,
      session: {
        apiUrl: 'https://api.libreview.io',
        token: 'token-inventado',
        accountIdHash: ACCOUNT_ID_HASH,
        expiresAt: 1_800_000_000_000,
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.libreview.io/llu/auth/login')
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('product')).toBe('llu.android')
    expect(headers.get('version')).toBe('4.16.0')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('authorization')).toBeNull()
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init?.body))).toEqual(CREDENTIALS)
  })

  it('con una redirección entra una vez más en la región que dice', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith('https://api.libreview.io')
        ? answer({ status: 0, data: { redirect: true, region: 'eu2' } })
        : answer(LOGIN_OK),
    )
    const result = await login(CREDENTIALS, config(fetchMock))

    expect(result).toMatchObject({
      ok: true,
      session: { apiUrl: 'https://api-eu2.libreview.io' },
    })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.libreview.io/llu/auth/login',
      'https://api-eu2.libreview.io/llu/auth/login',
    ])
  })

  it('una segunda redirección da BAD_RESPONSE, sin una tercera llamada', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      answer({ status: 0, data: { redirect: true, region: 'eu' } }),
    )
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_RESPONSE',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(['EU', 'eu.evil.test/x', 'e', 'eu12', ''])(
    'una región inválida (%j) da BAD_RESPONSE sin seguirla',
    async (region) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        answer({ status: 0, data: { redirect: true, region } }),
      )
      expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
        ok: false,
        error: 'BAD_RESPONSE',
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('status 2 da BAD_CREDENTIALS', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      answer({ status: 2, error: { message: 'notAuthenticated' } }),
    )
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_CREDENTIALS',
    })
  })

  it.each(['tou', 'pp', 'verifyEmail'])(
    'status 4 con el paso %s da ACCOUNT_ACTION_REQUIRED',
    async (type) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        answer({ status: 4, data: { step: { type, componentName: 'x' } } }),
      )
      expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
        ok: false,
        error: 'ACCOUNT_ACTION_REQUIRED',
      })
      // Never accepts anything: a single call.
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('status 4 con otro paso da BAD_RESPONSE', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      answer({ status: 4, data: { step: { type: 'otro' } } }),
    )
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_RESPONSE',
    })
  })

  it('HTTP 429 con Retry-After da LOCKED con esos segundos', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      answer({}, 429, { 'Retry-After': '1800' }),
    )
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'LOCKED',
      retryAfterSeconds: 1800,
    })
  })

  it('HTTP 429 sin Retry-After (o con una fecha) da LOCKED sin segundos', async () => {
    for (const headers of [
      {},
      { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
    ]) {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        answer({}, 429, headers),
      )
      expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
        ok: false,
        error: 'LOCKED',
      })
    }
  })

  it('un 200 con status 429 y lockout da LOCKED con esos segundos', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      answer({
        status: 429,
        data: { code: 60, data: { failures: 5, lockout: 300 } },
      }),
    )
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'LOCKED',
      retryAfterSeconds: 300,
    })
  })

  it('un 200 con status 429 sin lockout da LOCKED sin segundos', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => answer({ status: 429 }))
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'LOCKED',
    })
  })

  it('status 920 o HTTP 403 dan CLIENT_REJECTED', async () => {
    for (const response of [
      () => answer({ status: 920, data: { minimumVersion: '9.9.9' } }),
      () => answer('Forbidden', 403),
    ]) {
      const fetchMock = vi.fn<typeof fetch>(async () => response())
      expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
        ok: false,
        error: 'CLIENT_REJECTED',
      })
    }
  })

  it.each([500, 502, 503])('HTTP %i da UNAVAILABLE', async (status) => {
    const fetchMock = vi.fn<typeof fetch>(async () => answer('{}', status))
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    })
  })

  it('un error de red da UNAVAILABLE', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    })
  })

  it('si no responde a tiempo da UNAVAILABLE', async () => {
    expect(await login(CREDENTIALS, config(hangingFetch, 20))).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    })
  })

  it.each([
    ['otro 4xx', () => answer({}, 400)],
    ['un 401', () => answer({}, 401)],
    ['un cuerpo que no es JSON', () => answer('<html>error</html>')],
    ['un JSON sin status', () => answer({ data: {} })],
    ['un status desconocido', () => answer({ status: 7 })],
    [
      'status 0 sin token',
      () => answer({ status: 0, data: { user: { id: 'x' } } }),
    ],
    [
      'status 0 con expires que no es número',
      () =>
        answer({
          status: 0,
          data: {
            user: { id: 'x' },
            authTicket: { token: 't', expires: 'mañana' },
          },
        }),
    ],
  ])('%s da BAD_RESPONSE', async (_label, response) => {
    const fetchMock = vi.fn<typeof fetch>(async () => response())
    expect(await login(CREDENTIALS, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_RESPONSE',
    })
  })
})

const SESSION: LibreSession = {
  apiUrl: 'https://api-eu.libreview.io',
  token: 'token-inventado',
  accountIdHash: 'hash-inventado',
  expiresAt: 1_800_000_000_000,
}

function connections(measurement: unknown): Response {
  return answer({
    status: 0,
    data: [{ patientId: 'p1', glucoseMeasurement: measurement }],
  })
}

const MEASUREMENT = {
  ValueInMgPerDl: 123,
  TrendArrow: 3,
  FactoryTimestamp: '11/27/2026 3:05:12 PM',
  Timestamp: '11/27/2026 12:05:12 PM',
}

describe('readLatest', () => {
  it('devuelve la lectura de la primera conexión y arma bien el pedido', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      answer({
        status: 0,
        data: [
          { glucoseMeasurement: MEASUREMENT },
          { glucoseMeasurement: { ...MEASUREMENT, ValueInMgPerDl: 200 } },
        ],
      }),
    )
    expect(await readLatest(SESSION, config(fetchMock))).toEqual({
      ok: true,
      reading: {
        mgdl: 123,
        trend: 'steady',
        measured_at: '2026-11-27T15:05:12.000Z',
      },
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api-eu.libreview.io/llu/connections')
    expect(init?.method).toBe('GET')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer token-inventado')
    expect(headers.get('account-id')).toBe('hash-inventado')
    expect(headers.get('product')).toBe('llu.android')
    expect(headers.get('version')).toBe('4.16.0')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    [1, 'falling_fast'],
    [2, 'falling'],
    [3, 'steady'],
    [4, 'rising'],
    [5, 'rising_fast'],
    [0, null],
    [6, null],
    ['3', null],
    [undefined, null],
  ])('TrendArrow %j da %j', async (arrow, trend) => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      connections({ ...MEASUREMENT, TrendArrow: arrow }),
    )
    expect(await readLatest(SESSION, config(fetchMock))).toMatchObject({
      ok: true,
      reading: { trend },
    })
  })

  it.each([
    ['11/27/2026 12:00:00 AM', '2026-11-27T00:00:00.000Z'],
    ['11/27/2026 12:30:00 PM', '2026-11-27T12:30:00.000Z'],
    ['11/27/2026 1:02:03 AM', '2026-11-27T01:02:03.000Z'],
    ['1/5/2027 11:59:59 PM', '2027-01-05T23:59:59.000Z'],
  ])('FactoryTimestamp %s es %s (UTC)', async (timestamp, iso) => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      connections({ ...MEASUREMENT, FactoryTimestamp: timestamp }),
    )
    expect(await readLatest(SESSION, config(fetchMock))).toMatchObject({
      ok: true,
      reading: { measured_at: iso },
    })
  })

  it.each([
    '2026-11-27T15:05:12Z',
    '11/27/2026 13:05:12 PM',
    '11/27/2026 0:05:12 AM',
    '11/27/2026 3:60:00 PM',
    '2/30/2026 3:05:12 PM',
    '13/1/2026 3:05:12 PM',
    '',
  ])('un FactoryTimestamp roto (%j) da BAD_RESPONSE', async (timestamp) => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      connections({ ...MEASUREMENT, FactoryTimestamp: timestamp }),
    )
    expect(await readLatest(SESSION, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_RESPONSE',
    })
  })

  it.each([0, -5, 123.4, '123', null])(
    'un valor inválido (%j) da BAD_RESPONSE, sin redondear',
    async (value) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        connections({ ...MEASUREMENT, ValueInMgPerDl: value }),
      )
      expect(await readLatest(SESSION, config(fetchMock))).toEqual({
        ok: false,
        error: 'BAD_RESPONSE',
      })
    },
  )

  it('sin conexiones da NO_CONNECTION', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      answer({ status: 0, data: [] }),
    )
    expect(await readLatest(SESSION, config(fetchMock))).toEqual({
      ok: false,
      error: 'NO_CONNECTION',
    })
  })

  it('una conexión sin lectura da reading null', async () => {
    for (const body of [
      { status: 0, data: [{ patientId: 'p1' }] },
      { status: 0, data: [{ glucoseMeasurement: null }] },
    ]) {
      const fetchMock = vi.fn<typeof fetch>(async () => answer(body))
      expect(await readLatest(SESSION, config(fetchMock))).toEqual({
        ok: true,
        reading: null,
      })
    }
  })

  it('401 da SESSION_EXPIRED', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => answer({}, 401))
    expect(await readLatest(SESSION, config(fetchMock))).toEqual({
      ok: false,
      error: 'SESSION_EXPIRED',
    })
  })

  it.each([
    [() => answer({}, 429), 'LOCKED'],
    [() => answer({}, 403), 'CLIENT_REJECTED'],
    [() => answer({ status: 920 }), 'CLIENT_REJECTED'],
    [() => answer({}, 503), 'UNAVAILABLE'],
    [() => answer({}, 404), 'BAD_RESPONSE'],
    [() => answer('no json'), 'BAD_RESPONSE'],
    [() => answer({ status: 0, data: 'x' }), 'BAD_RESPONSE'],
  ] as const)('el caso %# da %s', async (response, error) => {
    const fetchMock = vi.fn<typeof fetch>(async () => response())
    expect(await readLatest(SESSION, config(fetchMock))).toEqual({
      ok: false,
      error,
    })
  })

  it('un error de red da UNAVAILABLE', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await readLatest(SESSION, config(fetchMock))).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    })
  })

  it('si no responde a tiempo da UNAVAILABLE', async () => {
    expect(await readLatest(SESSION, config(hangingFetch, 20))).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    })
  })
})
