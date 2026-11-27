import { describe, expect, it } from 'vitest'
import {
  GLUCOSE_STALE_MINUTES,
  glucoseAgoText,
  glucoseRetryText,
  isStaleReading,
  minutesSince,
  trendLabel,
} from './glucose.ts'

const MEASURED = '2026-11-27T15:00:00.000Z'
const AT = Date.parse(MEASURED)

describe('minutesSince', () => {
  it.each([
    [0, 0],
    [59_999, 0],
    [60_000, 1],
    [5 * 60_000 + 30_000, 5],
    [90 * 60_000, 90],
  ])('%i ms después son %i min (piso)', (ms, minutes) => {
    expect(minutesSince(MEASURED, AT + ms)).toBe(minutes)
  })

  it('nunca es negativo (un reloj atrasado da 0)', () => {
    expect(minutesSince(MEASURED, AT - 5 * 60_000)).toBe(0)
  })

  it('una fecha rota da 0', () => {
    expect(minutesSince('no es fecha', AT)).toBe(0)
  })
})

describe('glucoseAgoText', () => {
  it.each([
    [0, 'recién'],
    [1, 'hace 1 min'],
    [15, 'hace 15 min'],
    [59, 'hace 59 min'],
    [60, 'hace más de una hora'],
    [600, 'hace más de una hora'],
  ])('%i min dice %j', (minutes, text) => {
    expect(glucoseAgoText(minutes)).toBe(text)
  })
})

describe('isStaleReading', () => {
  it('es vieja recién después de 15 min', () => {
    expect(GLUCOSE_STALE_MINUTES).toBe(15)
    expect(isStaleReading(15)).toBe(false)
    expect(isStaleReading(16)).toBe(true)
    expect(isStaleReading(0)).toBe(false)
  })
})

describe('trendLabel', () => {
  it('dice la tendencia con palabras', () => {
    expect(
      (
        ['falling_fast', 'falling', 'steady', 'rising', 'rising_fast'] as const
      ).map(trendLabel),
    ).toEqual([
      'bajando rápido',
      'bajando',
      'estable',
      'subiendo',
      'subiendo rápido',
    ])
  })
})

describe('glucoseRetryText', () => {
  it('da la hora de Buenos Aires, con segundos', () => {
    // 18:20:05 UTC son las 15:20:05 en Buenos Aires (UTC-3).
    expect(glucoseRetryText('2026-11-27T18:20:05.000Z')).toBe(
      'Se vuelve a probar a las 15:20:05',
    )
  })

  it('pasada la medianoche UTC sigue en el día anterior, con 24 h', () => {
    expect(glucoseRetryText('2026-11-28T02:05:00.000Z')).toBe(
      'Se vuelve a probar a las 23:05:00',
    )
    expect(glucoseRetryText('2026-11-28T03:00:09.000Z')).toBe(
      'Se vuelve a probar a las 00:00:09',
    )
  })

  it('una fecha rota no da texto', () => {
    expect(glucoseRetryText('no es fecha')).toBeNull()
  })
})
