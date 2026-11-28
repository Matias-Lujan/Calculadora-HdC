// The drawing of the 24-hour glucose chart (spec §6.10): which readings and
// meals go in, where each one goes and which hours are labeled. Only
// drawing, not a calculation: the glucose never goes into the dose
// (CLAUDE.md, rule 7), so none of this is in src/domain/.

/** The chart shows the last 24 hours, up to now. */
export const CHART_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * More than this between two readings cuts the line: the sensor gives one
 * every ~15 min, so a longer gap means readings are missing.
 */
export const CHART_GAP_MS = 30 * 60 * 1000

/** The bottom of the scale, in mg/dL (the lowest a sensor reports). */
export const CHART_BOTTOM_MGDL = 40

/** The top of the scale when every reading is lower. */
export const CHART_MIN_TOP_MGDL = 300

/** The gray band, the same for everybody (spec §6.10). */
export const BAND_LOW_MGDL = 70
export const BAND_HIGH_MGDL = 180

/** A reading as the chart reads it: when it was measured (ISO) and mg/dL. */
export type ChartReading = { measured_at: string; mgdl: number }

/** A reading ready to draw: its time in ms and its mg/dL. */
export type ChartPoint = { time: number; mgdl: number }

/** Whether a time is inside the window (from now − 24 h to now). */
export function inChartWindow(time: number, now: number): boolean {
  return time >= now - CHART_WINDOW_MS && time <= now
}

/**
 * The readings inside the window, oldest first. The table can keep older
 * rows if a save failed, so the window is always applied here.
 */
export function chartPoints(
  readings: readonly ChartReading[],
  now: number,
): ChartPoint[] {
  return readings
    .map((reading) => ({
      time: Date.parse(reading.measured_at),
      mgdl: reading.mgdl,
    }))
    .filter((point) => inChartWindow(point.time, now))
    .sort((a, b) => a.time - b.time)
}

/**
 * The saved readings plus the live one of Inicio, only if it is newer than
 * the last saved one and inside the window: the saved ones come every
 * ~15 min, the live one fills the end of the line.
 */
export function withLatest(
  saved: readonly ChartReading[],
  latest: ChartReading | null | undefined,
  now: number,
): ChartReading[] {
  if (latest === null || latest === undefined) return [...saved]
  const time = Date.parse(latest.measured_at)
  if (!inChartWindow(time, now)) return [...saved]
  const newest = Math.max(
    ...saved.map((reading) => Date.parse(reading.measured_at)),
  )
  // Math.max of nothing is -Infinity: without saved ones it is added.
  return time > newest ? [...saved, latest] : [...saved]
}

/**
 * The pieces of the line: a new one starts when more than CHART_GAP_MS
 * passed since the reading before (exactly CHART_GAP_MS does not cut).
 */
export function chartSegments(points: readonly ChartPoint[]): ChartPoint[][] {
  const segments: ChartPoint[][] = []
  let previous: ChartPoint | undefined
  for (const point of points) {
    const current = segments.at(-1)
    if (
      current === undefined ||
      previous === undefined ||
      point.time - previous.time > CHART_GAP_MS
    ) {
      segments.push([point])
    } else {
      current.push(point)
    }
    previous = point
  }
  return segments
}

/**
 * The top of the scale: CHART_MIN_TOP_MGDL, or the highest reading rounded
 * up to a multiple of 50 if it is higher.
 */
export function chartTop(points: readonly ChartPoint[]): number {
  const highest = Math.max(CHART_BOTTOM_MGDL, ...points.map((p) => p.mgdl))
  return Math.max(CHART_MIN_TOP_MGDL, Math.ceil(highest / 50) * 50)
}

/** Where a time goes across: 0 at now − 24 h, `width` at now. */
export function chartX(time: number, now: number, width: number): number {
  return ((time - (now - CHART_WINDOW_MS)) / CHART_WINDOW_MS) * width
}

/**
 * Where a value goes up and down: `height` at the bottom of the scale and 0
 * at the top (SVG grows downwards). A value below the bottom stays on it.
 */
export function chartY(mgdl: number, top: number, height: number): number {
  const clamped = Math.max(CHART_BOTTOM_MGDL, mgdl)
  return (
    height -
    ((clamped - CHART_BOTTOM_MGDL) / (top - CHART_BOTTOM_MGDL)) * height
  )
}

/** The times of the meals inside the window, oldest first. */
export function mealMarkTimes(
  eatenAt: readonly string[],
  now: number,
): number[] {
  return eatenAt
    .map((time) => Date.parse(time))
    .filter((time) => inChartWindow(time, now))
    .sort((a, b) => a - b)
}

const argentinaHour = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  numberingSystem: 'latn',
  hour: '2-digit',
  hourCycle: 'h23',
})

const HOUR_MS = 60 * 60 * 1000

/** An hour labeled under the chart: its time and its text ("06 h"). */
export type ChartHour = { time: number; label: string }

/**
 * The hours labeled under the chart: 00, 06, 12 and 18 in Argentina time,
 * inside the window, oldest first. They are looked for among the whole UTC
 * hours, so they stay right if the offset of Argentina ever changes.
 */
export function chartHours(now: number): ChartHour[] {
  const hours: ChartHour[] = []
  const first = Math.ceil((now - CHART_WINDOW_MS) / HOUR_MS) * HOUR_MS
  for (let time = first; time <= now; time += HOUR_MS) {
    const hour = argentinaHour.format(time)
    if (Number(hour) % 6 === 0) hours.push({ time, label: `${hour} h` })
  }
  return hours
}

/**
 * What a screen reader hears of the chart, in plain words: how many
 * readings, the lowest and the highest, and how many meals.
 */
export function chartDescription(
  points: readonly ChartPoint[],
  marks: number,
): string {
  const meals =
    marks === 0
      ? 'sin comidas guardadas'
      : marks === 1
        ? '1 comida guardada'
        : `${marks} comidas guardadas`
  if (points.length === 0) {
    return `Glucosa de las últimas 24 horas: sin lecturas, ${meals}.`
  }
  const values = points.map((point) => point.mgdl)
  const readings =
    points.length === 1 ? '1 lectura' : `${points.length} lecturas`
  const lowest = Math.min(...values)
  const highest = Math.max(...values)
  const range =
    lowest === highest
      ? `de ${lowest} mg/dL`
      : `entre ${lowest} y ${highest} mg/dL`
  return `Glucosa de las últimas 24 horas: ${readings}, ${range}, ${meals}.`
}
