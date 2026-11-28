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

// The screen of the glucose chart (spec §6.10).

export const GLUCOSE_CHART_TITLE = 'Glucosa'

export const GLUCOSE_CHART_EMPTY_TEXT = 'Todavía no hay lecturas guardadas.'

/** Under the empty text, without readings in the 24 hours (UX-36). */
export const GLUCOSE_CHART_EMPTY_HINT =
  'Se guardan solas, aunque la app esté cerrada. Volvé en un rato.'

/** When the 24 hours have readings but the chosen period does not. */
export function chartPeriodEmptyText(hours: number): string {
  return `No hay lecturas guardadas de las últimas ${hours} horas.`
}

/** Under chartPeriodEmptyText: the 24 hours do have readings. */
export const GLUCOSE_CHART_PERIOD_EMPTY_HINT = 'Probá con un período más largo.'

/** A period of the selector (UX-31): what it shows and what is heard. */
export function chartPeriodText(hours: number): {
  short: string
  spoken: string
} {
  return { short: `${hours} h`, spoken: `${hours} horas` }
}

/** The name of the selector, for screen readers. */
export const GLUCOSE_CHART_PERIODS_LABEL = 'Horas a mostrar'

/** The name of the chart for screen readers (it is adjustable, UX-29). */
export const GLUCOSE_CHART_LABEL = 'Lecturas de glucosa'

const clock = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  numberingSystem: 'latn',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * "16:40", in Buenos Aires time: the time of a picked reading (UX-46) and
 * the time of now at the end of the axis (UX-45).
 */
export function clockText(time: number): string {
  return clock.format(time)
}

/**
 * A tap in a gap: "Sin lecturas entre las 10:15 y las 12:20", or only one
 * end at the start or the end of the period.
 */
export function chartGapText(
  before: number | null,
  after: number | null,
): string {
  if (before !== null && after !== null) {
    return `Sin lecturas entre las ${clockText(before)} y las ${clockText(after)}`
  }
  if (after !== null) return `Sin lecturas hasta las ${clockText(after)}`
  if (before !== null) return `Sin lecturas desde las ${clockText(before)}`
  return 'Sin lecturas'
}

/** A meal close to the picked time, without carbs nor dose (#102). */
export function chartMealText(time: number): string {
  return `Comiste a las ${clockText(time)}`
}

/** What a screen reader hears of a picked reading: "16:40, 132 mg/dL". */
export function chartReadingValueText(time: number, mgdl: number): string {
  return `${clockText(time)}, ${mgdl} mg/dL`
}
