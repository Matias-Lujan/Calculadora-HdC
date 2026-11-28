import { describe, expect, it } from 'vitest'
import {
  FUTURE_MS,
  GRAPH_SYNC_MS,
  KEEP_MS,
  cutoffIso,
  isGraphDue,
  isTaskRequest,
  readingsToKeep,
  shouldSyncGraph,
} from './sync.ts'

// Invented data only.

const NOW = Date.UTC(2026, 10, 27, 15, 0, 0)
const at = (ms: number) => new Date(ms).toISOString()

describe('shouldSyncGraph', () => {
  const SESSION = {
    apiUrl: 'https://api.example.test',
    token: 'token-inventado',
    accountIdHash: 'abc123',
    expiresAt: NOW + 60 * 60_000,
  }
  const STATE = { session: SESSION, loginAfter: null, loginError: null }
  const OK = { ok: true as const, reading: null, patientId: 'paciente-1' }
  const DUE = NOW - GRAPH_SYNC_MS

  it('lectura buena, sin login y vencido: lee con la sesión y la conexión', () => {
    expect(
      shouldSyncGraph({ result: OK, state: STATE, loggedIn: false }, DUE, NOW),
    ).toEqual({ patientId: 'paciente-1', session: SESSION })
  })

  it('nunca guardado: lee', () => {
    expect(
      shouldSyncGraph({ result: OK, state: STATE, loggedIn: false }, null, NOW),
    ).not.toBeNull()
  })

  it('si la llamada hizo login, no lee', () => {
    expect(
      shouldSyncGraph({ result: OK, state: STATE, loggedIn: true }, DUE, NOW),
    ).toBeNull()
  })

  it('sin conexión (patientId null), no lee', () => {
    const result = { ...OK, patientId: null }
    expect(
      shouldSyncGraph({ result, state: STATE, loggedIn: false }, DUE, NOW),
    ).toBeNull()
  })

  it('si la lectura falló, no lee', () => {
    const result = { ok: false as const, code: 'GLUCOSE_UNAVAILABLE' as const }
    expect(
      shouldSyncGraph({ result, state: STATE, loggedIn: false }, DUE, NOW),
    ).toBeNull()
  })

  it('sin sesión, no lee', () => {
    const state = { ...STATE, session: null }
    expect(
      shouldSyncGraph({ result: OK, state, loggedIn: false }, DUE, NOW),
    ).toBeNull()
  })

  it('a menos de 15 min del último guardado, no lee', () => {
    expect(
      shouldSyncGraph(
        { result: OK, state: STATE, loggedIn: false },
        DUE + 1000,
        NOW,
      ),
    ).toBeNull()
  })
})

describe('isGraphDue', () => {
  it('sin un guardado anterior, toca', () => {
    expect(isGraphDue(null, NOW)).toBe(true)
  })

  it('a los 14:59 min no toca; a los 15:00, sí', () => {
    expect(isGraphDue(NOW - GRAPH_SYNC_MS + 1000, NOW)).toBe(false)
    expect(isGraphDue(NOW - GRAPH_SYNC_MS, NOW)).toBe(true)
    expect(isGraphDue(NOW - 2 * GRAPH_SYNC_MS, NOW)).toBe(true)
  })

  it('recién guardado no toca', () => {
    expect(isGraphDue(NOW, NOW)).toBe(false)
  })

  it('un guardado en el futuro (reloj corrido) toca', () => {
    expect(isGraphDue(NOW + 1, NOW)).toBe(true)
  })
})

describe('readingsToKeep', () => {
  it('deja el borde exacto de 24 h y saca 1 ms más viejo', () => {
    const edge = { measured_at: at(NOW - KEEP_MS), mgdl: 100 }
    const older = { measured_at: at(NOW - KEEP_MS - 1), mgdl: 101 }
    expect(readingsToKeep([older, edge], NOW)).toEqual([edge])
  })

  it('deja hasta 5 min en el futuro y saca lo que pasa de ahí', () => {
    const ahead = { measured_at: at(NOW + FUTURE_MS), mgdl: 110 }
    const tooFar = { measured_at: at(NOW + FUTURE_MS + 1), mgdl: 111 }
    expect(readingsToKeep([ahead, tooFar], NOW)).toEqual([ahead])
  })

  it('una hora repetida queda una sola vez (la primera)', () => {
    const first = { measured_at: at(NOW - 60_000), mgdl: 120 }
    const repeated = { measured_at: at(NOW - 60_000), mgdl: 121 }
    const other = { measured_at: at(NOW - 120_000), mgdl: 122 }
    expect(readingsToKeep([first, repeated, other], NOW)).toEqual([
      first,
      other,
    ])
  })

  it('una hora que no es una fecha se saca', () => {
    expect(readingsToKeep([{ measured_at: 'x', mgdl: 100 }], NOW)).toEqual([])
  })

  it('un gráfico de 12 h (cada 15 min) queda entero y en orden', () => {
    const points = Array.from({ length: 49 }, (_, index) => ({
      measured_at: at(NOW - (48 - index) * 15 * 60_000),
      mgdl: 100 + index,
    }))
    expect(readingsToKeep(points, NOW)).toEqual(points)
  })

  it('con el reloj muy atrasado o adelantado no guarda lo que queda afuera', () => {
    const point = { measured_at: at(NOW), mgdl: 100 }
    expect(readingsToKeep([point], NOW - FUTURE_MS - 1)).toEqual([])
    expect(readingsToKeep([point], NOW + KEEP_MS + 1)).toEqual([])
  })

  it('sin lecturas da una lista vacía', () => {
    expect(readingsToKeep([], NOW)).toEqual([])
  })
})

describe('cutoffIso', () => {
  it('es 24 h antes de ahora', () => {
    expect(cutoffIso(NOW)).toBe('2026-11-26T15:00:00.000Z')
  })
})

describe('isTaskRequest', () => {
  const SECRET = 'sb_secret_inventada_123'

  it('la key secreta exacta es la tarea', () => {
    expect(isTaskRequest(SECRET, SECRET)).toBe(true)
  })

  it.each([
    null,
    '',
    'sb_publishable_inventada',
    'sb_secret_inventada_12',
    'sb_secret_inventada_1234',
    'sb_secret_inventada_124',
    'SB_SECRET_INVENTADA_123',
  ])('otro apikey (%j) no es la tarea', (apikey) => {
    expect(isTaskRequest(apikey, SECRET)).toBe(false)
  })

  it('sin key secreta nunca es la tarea', () => {
    expect(isTaskRequest('', '')).toBe(false)
  })
})
