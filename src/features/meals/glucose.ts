import type { GlucoseReading } from './types.ts'

// The texts of the glucose box of Inicio (spec §6.9). The reading is only
// shown: it never goes into the calculation (CLAUDE.md, rule 7).

/** A reading older than this may no longer be the current one. */
export const GLUCOSE_STALE_MINUTES = 15

/** The ⓘ of the box. */
export const GLUCOSE_INFO =
  'Es la última lectura de tu sensor, para tenerla a mano. No cambia la dosis.'

export const GLUCOSE_NO_READING_TEXT = 'El sensor no tiene lecturas por ahora.'

/** Added to the time of a reading that may no longer be the current one. */
export const GLUCOSE_STALE_TEXT = 'puede no ser la actual'

/**
 * Whole minutes since the reading was measured, rounded down. Never
 * negative: a phone clock a bit behind gives 0.
 */
export function minutesSince(measuredAt: string, now: number): number {
  const minutes = Math.floor((now - Date.parse(measuredAt)) / 60_000)
  return Number.isNaN(minutes) ? 0 : Math.max(0, minutes)
}

/** "ahora", "hace 5 min" or "hace más de una hora". */
export function glucoseAgoText(minutes: number): string {
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  return 'hace más de una hora'
}

export function isStaleReading(minutes: number): boolean {
  return minutes > GLUCOSE_STALE_MINUTES
}

const TREND_LABELS: Record<NonNullable<GlucoseReading['trend']>, string> = {
  falling_fast: 'bajando rápido',
  falling: 'bajando',
  steady: 'estable',
  rising: 'subiendo',
  rising_fast: 'subiendo rápido',
}

/** The trend in words, for the arrow (screen readers). */
export function trendLabel(
  trend: NonNullable<GlucoseReading['trend']>,
): string {
  return TREND_LABELS[trend]
}

const retryClock = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  numberingSystem: 'latn',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/**
 * "Se vuelve a probar a las 15:20:05", in Buenos Aires time, for when the
 * glucose waits after a failed login to LibreLink; null for a broken date.
 */
export function glucoseRetryText(retryAt: string): string | null {
  const time = Date.parse(retryAt)
  if (Number.isNaN(time)) return null
  return `Se vuelve a probar a las ${retryClock.format(time)}`
}
