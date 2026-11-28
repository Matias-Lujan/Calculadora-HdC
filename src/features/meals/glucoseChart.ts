// The drawing of the glucose chart (spec §6.10) and of the small curve of
// Inicio (spec §6.9): which readings and meals go in, where each one goes,
// which hours and guides are labeled and which reading is under the finger.
// Only drawing, not a calculation: the glucose never goes into the dose
// (CLAUDE.md, rule 7), so none of this is in src/domain/.

const MINUTE_MS = 60 * 1000
export const HOUR_MS = 60 * MINUTE_MS

/** The longest window: only the last 24 hours are kept. */
export const CHART_WINDOW_MS = 24 * HOUR_MS

/** The periods to choose on the chart (UX-31), shortest first. */
export const CHART_PERIODS_MS = [
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  CHART_WINDOW_MS,
] as const

/** The window of the small curve of Inicio (UX-35). */
export const SPARKLINE_WINDOW_MS = 3 * HOUR_MS

/**
 * More than this between two readings cuts the line: the sensor gives one
 * every ~15 min, so a longer gap means readings are missing.
 */
export const CHART_GAP_MS = 30 * MINUTE_MS

/** A gap longer than this gets a faint dashed bridge (UX-36). */
export const CHART_BRIDGE_MS = HOUR_MS

/** A meal this close to the reading under the finger is told (UX-29). */
export const CHART_MEAL_NEAR_MS = 15 * MINUTE_MS

/** The bottom of the scale, in mg/dL (the lowest a sensor reports). */
export const CHART_BOTTOM_MGDL = 40

/** The top of the scale when every reading is lower. */
export const CHART_MIN_TOP_MGDL = 300

/** The band, the same for everybody (spec §6.10). */
export const BAND_LOW_MGDL = 70
export const BAND_HIGH_MGDL = 180

/** A reading as the chart reads it: when it was measured (ISO) and mg/dL. */
export type ChartReading = { measured_at: string; mgdl: number }

/** A reading ready to draw: its time in ms and its mg/dL. */
export type ChartPoint = { time: number; mgdl: number }

/** Whether a time is inside the window (from now − window to now). */
export function inChartWindow(
  time: number,
  now: number,
  windowMs: number,
): boolean {
  return time >= now - windowMs && time <= now
}

/**
 * The readings inside the window, oldest first. The table can keep older
 * rows if a save failed, so the window is always applied here.
 */
export function chartPoints(
  readings: readonly ChartReading[],
  now: number,
  windowMs: number,
): ChartPoint[] {
  return readings
    .map((reading) => ({
      time: Date.parse(reading.measured_at),
      mgdl: reading.mgdl,
    }))
    .filter((point) => inChartWindow(point.time, now, windowMs))
    .sort((a, b) => a.time - b.time)
}

/**
 * The saved readings plus the live one of Inicio, only if it is newer than
 * the last saved one and inside the 24 hours: the saved ones come every
 * ~15 min, the live one fills the end of the line.
 */
export function withLatest(
  saved: readonly ChartReading[],
  latest: ChartReading | null | undefined,
  now: number,
): ChartReading[] {
  if (latest === null || latest === undefined) return [...saved]
  const time = Date.parse(latest.measured_at)
  if (!inChartWindow(time, now, CHART_WINDOW_MS)) return [...saved]
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

/** A gap of the line long enough for a bridge: its two ends. */
export type ChartBridge = { from: ChartPoint; to: ChartPoint }

/**
 * The gaps of more than CHART_BRIDGE_MS between two readings (exactly
 * CHART_BRIDGE_MS gets none), oldest first. The bridge is only a hint
 * that readings are missing: it never joins the line (#101).
 */
export function chartBridges(points: readonly ChartPoint[]): ChartBridge[] {
  const bridges: ChartBridge[] = []
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const to = points[i]
    if (from === undefined || to === undefined) continue
    if (to.time - from.time > CHART_BRIDGE_MS) bridges.push({ from, to })
  }
  return bridges
}

/**
 * The top of the scale: CHART_MIN_TOP_MGDL, or the highest reading rounded
 * up to a multiple of 50 if it is higher.
 */
export function chartTop(points: readonly ChartPoint[]): number {
  const highest = Math.max(CHART_BOTTOM_MGDL, ...points.map((p) => p.mgdl))
  return Math.max(CHART_MIN_TOP_MGDL, Math.ceil(highest / 50) * 50)
}

/** The horizontal guides (UX-30): 100, 200, 300… up to the top. */
export function chartGuides(top: number): number[] {
  const guides: number[] = []
  for (let mgdl = 100; mgdl <= top; mgdl += 100) guides.push(mgdl)
  return guides
}

/** Where a time goes across: 0 at now − window, `width` at now. */
export function chartX(
  time: number,
  now: number,
  width: number,
  windowMs: number,
): number {
  return ((time - (now - windowMs)) / windowMs) * width
}

/**
 * The other way around: the time at a place across (a tap), kept inside
 * the window.
 */
export function chartTime(
  x: number,
  now: number,
  width: number,
  windowMs: number,
): number {
  const share = Math.min(1, Math.max(0, x / width))
  return now - windowMs + share * windowMs
}

/**
 * Where a value goes up and down: `height` at the bottom of the scale and 0
 * at the top (SVG grows downwards). A value below the bottom stays on it.
 * The bottom is CHART_BOTTOM_MGDL, except on the small curve of Inicio.
 */
export function chartY(
  mgdl: number,
  top: number,
  height: number,
  bottom = CHART_BOTTOM_MGDL,
): number {
  const clamped = Math.max(bottom, mgdl)
  return height - ((clamped - bottom) / (top - bottom)) * height
}

/**
 * The scale of the small curve of Inicio (UX-35): in 40 px, the scale of
 * the chart (40 to 300) leaves the line almost flat, so it goes from a bit
 * under the lowest to a bit over the highest, always with the whole band.
 */
export function sparklineScale(points: readonly ChartPoint[]): {
  bottom: number
  top: number
} {
  const values = points.map((point) => point.mgdl)
  return {
    bottom: Math.min(BAND_LOW_MGDL, ...values) - 10,
    top: Math.max(BAND_HIGH_MGDL, ...values) + 10,
  }
}

/** The times of the meals inside the window, oldest first. */
export function mealMarkTimes(
  eatenAt: readonly string[],
  now: number,
  windowMs: number,
): number[] {
  return eatenAt
    .map((time) => Date.parse(time))
    .filter((time) => inChartWindow(time, now, windowMs))
    .sort((a, b) => a - b)
}

/**
 * Where the meal icons go across (UX-33): each one at its mark, but at
 * least `gap` after the one before, so two meals close together show two
 * icons, one a bit over the other. All of them stay between `min` and
 * `max`; if there is no room, the last ones are pushed back.
 */
export function spreadMarks(
  xs: readonly number[],
  gap: number,
  min: number,
  max: number,
): number[] {
  const spread: number[] = []
  for (const x of xs) {
    const previous = spread.at(-1)
    const at = Math.max(min, x)
    spread.push(previous === undefined ? at : Math.max(at, previous + gap))
  }
  for (let i = spread.length - 1; i >= 0; i--) {
    const next = spread[i + 1]
    const limit = next === undefined ? max : next - gap
    spread[i] = Math.min(spread[i] ?? limit, limit)
  }
  return spread
}

/**
 * The index of the reading closest in time; on a tie, the newer one. null
 * without readings.
 */
export function nearestIndex(
  points: readonly ChartPoint[],
  time: number,
): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  points.forEach((point, index) => {
    const distance = Math.abs(point.time - time)
    if (distance <= bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/**
 * What a tap at a time shows (UX-29): the closest reading, or the gap
 * around that time when the closest is more than CHART_GAP_MS away (exactly
 * CHART_GAP_MS still shows it). In a gap, `before` and `after` are the
 * readings at its ends (null at the start or the end of the window).
 */
export type ChartPick =
  | { kind: 'reading'; index: number; point: ChartPoint }
  | { kind: 'gap'; before: ChartPoint | null; after: ChartPoint | null }

export function pickAt(
  points: readonly ChartPoint[],
  time: number,
): ChartPick | null {
  const index = nearestIndex(points, time)
  if (index === null) return null
  const point = points[index]
  if (point === undefined) return null
  if (Math.abs(point.time - time) <= CHART_GAP_MS) {
    return { kind: 'reading', index, point }
  }
  const before = points.findLast((p) => p.time < time) ?? null
  const after = points.find((p) => p.time > time) ?? null
  return { kind: 'gap', before, after }
}

/**
 * The meal closest to a time, if it is at most CHART_MEAL_NEAR_MS before
 * or after; null otherwise.
 */
export function mealNear(
  marks: readonly number[],
  time: number,
): number | null {
  let best: number | null = null
  for (const mark of marks) {
    const distance = Math.abs(mark - time)
    if (
      distance <= CHART_MEAL_NEAR_MS &&
      (best === null || distance <= Math.abs(best - time))
    ) {
      best = mark
    }
  }
  return best
}

/**
 * The lowest and the highest reading of the period (UX-32); on a tie, the
 * newer one. null with fewer than two readings or all of them equal:
 * there is nothing to point out.
 */
export function chartExtremes(
  points: readonly ChartPoint[],
): { lowest: ChartPoint; highest: ChartPoint } | null {
  let lowest: ChartPoint | undefined
  let highest: ChartPoint | undefined
  for (const point of points) {
    if (lowest === undefined || point.mgdl <= lowest.mgdl) lowest = point
    if (highest === undefined || point.mgdl >= highest.mgdl) highest = point
  }
  if (
    points.length < 2 ||
    lowest === undefined ||
    highest === undefined ||
    lowest.mgdl === highest.mgdl
  ) {
    return null
  }
  return { lowest, highest }
}

const argentinaHour = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  numberingSystem: 'latn',
  hour: '2-digit',
  hourCycle: 'h23',
})

/**
 * An hour under the chart: its time and its text ("06 h"), or null when
 * the text would go over "ahora" (its line stays).
 */
export type ChartHour = { time: number; label: string | null }

/** How many hours between two labeled hours, for each period. */
function hourStep(windowMs: number): number {
  if (windowMs <= 6 * HOUR_MS) return 1
  if (windowMs <= 12 * HOUR_MS) return 3
  return 6
}

/**
 * How close to the right edge the text of an hour can be, in px of the
 * width given to chartHours: "ahora" goes there, about 36 px wide at 14 px,
 * and the text of an hour is centered on it, about 27 wide: at about 50 the
 * two texts touch. The chart is drawn in real px (UX-37), so it holds for
 * any width.
 */
export const CHART_HOUR_CLEARANCE = 52

/**
 * The hours under the chart, in Argentina time, inside the window and
 * before now, oldest first: every hour for 3 and 6 hours, every 3 for 12
 * and 00, 06, 12 and 18 for 24. "ahora" goes at the end, so an hour less
 * than CHART_HOUR_CLEARANCE from the right edge of a drawing `width` wide
 * keeps its line but not its text. They are looked for among the whole UTC
 * hours, so they stay right if the offset of Argentina ever changes.
 */
export function chartHours(
  now: number,
  windowMs: number,
  width: number,
): ChartHour[] {
  const step = hourStep(windowMs)
  const hours: ChartHour[] = []
  const first = Math.ceil((now - windowMs) / HOUR_MS) * HOUR_MS
  for (let time = first; time < now; time += HOUR_MS) {
    const hour = argentinaHour.format(time)
    if (Number(hour) % step !== 0) continue
    const clear =
      width - chartX(time, now, width, windowMs) >= CHART_HOUR_CLEARANCE
    hours.push({ time, label: clear ? `${hour} h` : null })
  }
  return hours
}

/**
 * What a screen reader hears of the chart, in plain words: the period, how
 * many readings, the lowest and the highest, and how many meals.
 */
export function chartDescription(
  points: readonly ChartPoint[],
  marks: number,
  windowMs: number,
): string {
  const period = `Glucosa de las últimas ${windowMs / HOUR_MS} horas`
  const meals =
    marks === 0
      ? 'sin comidas guardadas'
      : marks === 1
        ? '1 comida guardada'
        : `${marks} comidas guardadas`
  if (points.length === 0) {
    return `${period}: sin lecturas, ${meals}.`
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
  return `${period}: ${readings}, ${range}, ${meals}.`
}
