import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlucoseReading } from './contract.ts'
import {
  EMPTY_STATE,
  LOGIN_WAIT_MS,
  latestGlucose,
  type LibreState,
} from './latest.ts'
import { login, readLatest, type LibreSession } from './provider.ts'

// Invented data only. provider.ts is replaced: these tests check when the
// function logs in, when it waits and what it keeps.

vi.mock('./provider.ts', () => ({ login: vi.fn(), readLatest: vi.fn() }))

const loginMock = vi.mocked(login)
const readMock = vi.mocked(readLatest)

const NOW = Date.UTC(2026, 10, 27, 15, 0, 0)
const CREDENTIALS = { email: 'prueba@example.test', password: 'clave-falsa' }
const CONFIG = { fetch: vi.fn<typeof fetch>(), timeoutMs: 10 }

const KEPT: LibreSession = {
  apiUrl: 'https://api-eu.libreview.io',
  token: 'token-guardado',
  accountIdHash: 'hash-inventado',
  expiresAt: NOW + 24 * 60 * 60 * 1000,
}
const NEW: LibreSession = { ...KEPT, token: 'token-nuevo' }

const READING: GlucoseReading = {
  mgdl: 110,
  trend: 'rising',
  measured_at: '2026-11-27T14:59:00.000Z',
}

const withSession: LibreState = {
  session: KEPT,
  loginAfter: null,
  loginError: null,
}

function run(state: LibreState, now = NOW) {
  return latestGlucose(state, now, CREDENTIALS, CONFIG)
}

beforeEach(() => {
  loginMock.mockReset()
  readMock.mockReset()
})

describe('latestGlucose', () => {
  it('con una sesión vigente lee sin entrar y no cambia nada', async () => {
    readMock.mockResolvedValue({ ok: true, reading: READING })
    const outcome = await run(withSession)

    expect(outcome).toEqual({
      result: { ok: true, reading: READING },
      state: withSession,
      changed: false,
      events: [],
    })
    expect(loginMock).not.toHaveBeenCalled()
    expect(readMock).toHaveBeenCalledWith(KEPT, CONFIG)
  })

  it('un sensor sin lectura (reading null) no es un error', async () => {
    readMock.mockResolvedValue({ ok: true, reading: null })
    expect((await run(withSession)).result).toEqual({ ok: true, reading: null })
  })

  it('sin sesión entra, guarda la sesión y lee con ella', async () => {
    loginMock.mockResolvedValue({ ok: true, session: NEW })
    readMock.mockResolvedValue({ ok: true, reading: READING })
    const outcome = await run(EMPTY_STATE)

    expect(outcome).toEqual({
      result: { ok: true, reading: READING },
      state: { session: NEW, loginAfter: null, loginError: null },
      changed: true,
      events: ['LOGIN'],
    })
    expect(loginMock).toHaveBeenCalledWith(CREDENTIALS, CONFIG)
    expect(readMock).toHaveBeenCalledWith(NEW, CONFIG)
  })

  it('una sesión vencida por fecha se descarta sin usarla', async () => {
    loginMock.mockResolvedValue({ ok: true, session: NEW })
    readMock.mockResolvedValue({ ok: true, reading: READING })
    const outcome = await run({
      ...withSession,
      session: { ...KEPT, expiresAt: NOW },
    })

    expect(readMock).toHaveBeenCalledTimes(1)
    expect(readMock).toHaveBeenCalledWith(NEW, CONFIG)
    expect(outcome.state.session).toEqual(NEW)
    expect(outcome.changed).toBe(true)
  })

  it('SESSION_EXPIRED descarta la sesión, entra una vez y vuelve a leer', async () => {
    readMock
      .mockResolvedValueOnce({ ok: false, error: 'SESSION_EXPIRED' })
      .mockResolvedValueOnce({ ok: true, reading: READING })
    loginMock.mockResolvedValue({ ok: true, session: NEW })
    const outcome = await run(withSession)

    expect(outcome).toEqual({
      result: { ok: true, reading: READING },
      state: { session: NEW, loginAfter: null, loginError: null },
      changed: true,
      events: ['READ_FAILED SESSION_EXPIRED', 'LOGIN'],
    })
    expect(loginMock).toHaveBeenCalledTimes(1)
  })

  it('un segundo SESSION_EXPIRED da GLUCOSE_UNAVAILABLE y espera, sin otro login', async () => {
    readMock.mockResolvedValue({ ok: false, error: 'SESSION_EXPIRED' })
    loginMock.mockResolvedValue({ ok: true, session: NEW })
    const outcome = await run(withSession)

    expect(outcome.result).toEqual({ ok: false, code: 'GLUCOSE_UNAVAILABLE' })
    expect(outcome.state).toEqual({
      session: null,
      loginAfter: NOW + LOGIN_WAIT_MS,
      loginError: 'GLUCOSE_UNAVAILABLE',
    })
    expect(outcome.changed).toBe(true)
    expect(loginMock).toHaveBeenCalledTimes(1)
    expect(readMock).toHaveBeenCalledTimes(2)
  })

  it('un login con BAD_CREDENTIALS espera 15 min y guarda el código', async () => {
    loginMock.mockResolvedValue({ ok: false, error: 'BAD_CREDENTIALS' })
    const outcome = await run(EMPTY_STATE)

    expect(outcome).toEqual({
      result: { ok: false, code: 'GLUCOSE_LOGIN_FAILED' },
      state: {
        session: null,
        loginAfter: NOW + 15 * 60 * 1000,
        loginError: 'GLUCOSE_LOGIN_FAILED',
      },
      changed: true,
      events: ['LOGIN', 'LOGIN_FAILED BAD_CREDENTIALS'],
    })
    expect(readMock).not.toHaveBeenCalled()
  })

  it.each([
    ['ACCOUNT_ACTION_REQUIRED', 'GLUCOSE_ACTION_NEEDED'],
    ['NO_CONNECTION', 'GLUCOSE_NOT_SHARED'],
    ['CLIENT_REJECTED', 'GLUCOSE_UNAVAILABLE'],
    ['UNAVAILABLE', 'GLUCOSE_UNAVAILABLE'],
    ['BAD_RESPONSE', 'GLUCOSE_UNAVAILABLE'],
  ] as const)('un login fallido con %s da %s y espera', async (error, code) => {
    loginMock.mockResolvedValue({ ok: false, error })
    const outcome = await run(EMPTY_STATE)
    expect(outcome.result).toEqual({ ok: false, code })
    expect(outcome.state).toEqual({
      session: null,
      loginAfter: NOW + LOGIN_WAIT_MS,
      loginError: code,
    })
  })

  it('dentro de la espera responde el código guardado sin llamar a nada', async () => {
    const state: LibreState = {
      session: null,
      loginAfter: NOW + 1,
      loginError: 'GLUCOSE_LOGIN_FAILED',
    }
    const outcome = await run(state)

    expect(outcome).toEqual({
      result: { ok: false, code: 'GLUCOSE_LOGIN_FAILED' },
      state,
      changed: false,
      events: [],
    })
    expect(loginMock).not.toHaveBeenCalled()
    expect(readMock).not.toHaveBeenCalled()
  })

  it('dentro de la espera, sin código guardado, da GLUCOSE_UNAVAILABLE', async () => {
    const outcome = await run({
      session: null,
      loginAfter: NOW + 1,
      loginError: null,
    })
    expect(outcome.result).toEqual({ ok: false, code: 'GLUCOSE_UNAVAILABLE' })
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('al terminar la espera vuelve a entrar y la limpia', async () => {
    loginMock.mockResolvedValue({ ok: true, session: NEW })
    readMock.mockResolvedValue({ ok: true, reading: READING })
    const outcome = await run({
      session: null,
      loginAfter: NOW,
      loginError: 'GLUCOSE_LOGIN_FAILED',
    })

    expect(loginMock).toHaveBeenCalledTimes(1)
    expect(outcome.state).toEqual({
      session: NEW,
      loginAfter: null,
      loginError: null,
    })
  })

  it.each([
    [1800, 30 * 60 * 1000],
    [60, LOGIN_WAIT_MS],
    [0, LOGIN_WAIT_MS],
  ])(
    'LOCKED con %i s espera %i ms (nunca menos de 15 min)',
    async (seconds, wait) => {
      loginMock.mockResolvedValue({
        ok: false,
        error: 'LOCKED',
        retryAfterSeconds: seconds,
      })
      const outcome = await run(EMPTY_STATE)
      expect(outcome.result).toEqual({ ok: false, code: 'GLUCOSE_UNAVAILABLE' })
      expect(outcome.state.loginAfter).toBe(NOW + wait)
    },
  )

  it.each([
    'UNAVAILABLE',
    'BAD_RESPONSE',
    'LOCKED',
    'CLIENT_REJECTED',
  ] as const)(
    'un error de lectura (%s) con sesión vigente no la borra ni crea espera',
    async (error) => {
      readMock.mockResolvedValue({ ok: false, error })
      const outcome = await run(withSession)

      expect(outcome).toEqual({
        result: { ok: false, code: 'GLUCOSE_UNAVAILABLE' },
        state: withSession,
        changed: false,
        events: [`READ_FAILED ${error}`],
      })
      expect(loginMock).not.toHaveBeenCalled()
    },
  )

  it('NO_CONNECTION al leer con sesión vigente da GLUCOSE_NOT_SHARED', async () => {
    readMock.mockResolvedValue({ ok: false, error: 'NO_CONNECTION' })
    const outcome = await run(withSession)
    expect(outcome.result).toEqual({ ok: false, code: 'GLUCOSE_NOT_SHARED' })
    expect(outcome.state).toEqual(withSession)
  })

  it('un error de lectura justo después de entrar guarda la sesión nueva', async () => {
    loginMock.mockResolvedValue({ ok: true, session: NEW })
    readMock.mockResolvedValue({ ok: false, error: 'UNAVAILABLE' })
    const outcome = await run(EMPTY_STATE)

    expect(outcome.result).toEqual({ ok: false, code: 'GLUCOSE_UNAVAILABLE' })
    expect(outcome.state).toEqual({
      session: NEW,
      loginAfter: null,
      loginError: null,
    })
    expect(outcome.changed).toBe(true)
  })
})
