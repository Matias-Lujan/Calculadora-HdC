import { Utensils } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  GLUCOSE_CHART_BAND_LEGEND,
  GLUCOSE_CHART_HINT,
  GLUCOSE_CHART_LABEL,
  GLUCOSE_CHART_MEAL_LEGEND,
  chartAtText,
  chartGapText,
  chartMealText,
  chartReadingValueText,
  isStaleReading,
} from '../glucose.ts'
import {
  BAND_HIGH_MGDL,
  BAND_LOW_MGDL,
  chartBridges,
  chartDescription,
  chartExtremes,
  chartGuides,
  chartHours,
  chartPoints,
  chartSegments,
  chartTime,
  chartTop,
  chartX,
  chartY,
  mealMarkTimes,
  mealNear,
  nearestIndex,
  pickAt,
  spreadMarks,
  type ChartPick,
  type ChartPoint,
  type ChartReading,
} from '../glucoseChart.ts'

type Props = {
  /** The readings to draw; only the ones of the window go in. */
  readings: readonly ChartReading[]
  /** When each saved meal was eaten (ISO); one mark for each. */
  mealTimes: readonly string[]
  /** The end of the window, in ms. */
  now: number
  /** How long the window is, in ms (3, 6, 12 or 24 hours, UX-31). */
  windowMs: number
}

// The drawing, in units of the viewBox: it takes the whole width and keeps
// its proportions (about 280 px high on an iPhone, so the hours and "ahora"
// stay above the tab bar, UX-30). The row on top holds "mg/dL" and the meal
// icons.
const WIDTH = 320
const HEIGHT = 270
const LEFT = 36
const RIGHT = 10
const TOP = 30
const BOTTOM = 24
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM
const FONT = 13
const ICON_Y = 13
const ICON_R = 11
const ICON_SIZE = 14

/** The keys that move the picked reading, and by how many readings. */
const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  // About one hour (a reading every ~15 min), for VoiceOver's swipes.
  ArrowDown: -4,
  ArrowUp: 4,
  PageDown: -4,
  PageUp: 4,
}

/**
 * The glucose of the chosen period (spec §6.10), drawn by hand in SVG.
 * Only props, so it can go on any screen; the picked reading is its own
 * state. A light green band from 70 to 180 mg/dL, the same for everybody,
 * with its own color (not the green of "guardado"); guides at 100, 200,
 * 300; the line, cut where readings are missing; the point of now and the
 * lowest and highest values; and a mark with a fork and knife at each
 * meal, without carbs nor dose. Touching or dragging over it shows the
 * closest reading and its time (UX-29); for VoiceOver and the keyboard it
 * is adjustable, one reading at a time.
 */
export function GlucoseChart({ readings, mealTimes, now, windowMs }: Props) {
  const [picked, setPicked] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const descriptionId = useId()

  // The mark stays after letting go; a tap outside the chart takes it away.
  useEffect(() => {
    if (picked === null) return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const root = rootRef.current
      if (
        root !== null &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        setPicked(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [picked])

  const points = chartPoints(readings, now, windowMs)
  const segments = chartSegments(points)
  const bridges = chartBridges(points)
  const top = chartTop(points)
  const marks = mealMarkTimes(mealTimes, now, windowMs)
  const hours = chartHours(now, windowMs, PLOT_W)
  const extremes = chartExtremes(points)
  const last = points.at(-1)
  const x = (time: number) => LEFT + chartX(time, now, PLOT_W, windowMs)
  const y = (mgdl: number) => TOP + chartY(mgdl, top, PLOT_H)
  const bandTop = y(BAND_HIGH_MGDL)
  const bandBottom = y(BAND_LOW_MGDL)
  const icons = spreadMarks(
    marks.map(x),
    ICON_R + 1,
    LEFT + ICON_R,
    WIDTH - ICON_R,
  )
  const description = chartDescription(points, marks.length, windowMs)

  const pick = picked === null ? null : pickAt(points, picked)
  const pickTime =
    pick === null ? null : pick.kind === 'reading' ? pick.point.time : picked
  const meal = pickTime === null ? null : mealNear(marks, pickTime)

  const timeAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const across = ((event.clientX - rect.left) / rect.width) * WIDTH - LEFT
    return chartTime(across, now, PLOT_W, windowMs)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const count = points.length
    if (count === 0) return
    const current =
      picked === null ? count - 1 : (nearestIndex(points, picked) ?? count - 1)
    const step = KEY_STEPS[event.key]
    let next: number
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    else if (step !== undefined) next = current + step
    else return
    event.preventDefault()
    const point = points[Math.min(count - 1, Math.max(0, next))]
    if (point !== undefined) setPicked(point.time)
  }

  // An old last reading (more than 15 minutes) gets a hollow point.
  const lastStale =
    last !== undefined && isStaleReading(Math.floor((now - last.time) / 60_000))

  // The value labels of the lowest and the highest, unless they are the
  // point of now or too close to it (it is already in big above).
  const extremeLabels =
    extremes === null
      ? []
      : [
          { point: extremes.highest, above: true },
          { point: extremes.lowest, above: false },
        ].filter(
          ({ point }) =>
            last === undefined ||
            !(
              Math.abs(x(point.time) - x(last.time)) < 24 &&
              Math.abs(y(point.mgdl) - y(last.mgdl)) < 20
            ),
        )

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <PickedReading pick={pick} meal={meal} />
      <div
        role={points.length === 0 ? 'img' : 'slider'}
        tabIndex={points.length === 0 ? undefined : 0}
        aria-label={points.length === 0 ? description : GLUCOSE_CHART_LABEL}
        aria-describedby={points.length === 0 ? undefined : descriptionId}
        aria-valuemin={points.length === 0 ? undefined : 0}
        aria-valuemax={points.length === 0 ? undefined : points.length - 1}
        aria-valuenow={
          points.length === 0
            ? undefined
            : pick?.kind === 'reading'
              ? pick.index
              : picked !== null
                ? (nearestIndex(points, picked) ?? points.length - 1)
                : points.length - 1
        }
        aria-valuetext={valueText(pick, meal, last)}
        className="cursor-crosshair touch-pan-y rounded-control select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setPicked(timeAt(event))
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            setPicked(timeAt(event))
          }
        }}
        onKeyDown={onKeyDown}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true"
          className="block h-auto w-full"
        >
          <rect
            x={LEFT}
            y={bandTop}
            width={PLOT_W}
            height={bandBottom - bandTop}
            className="fill-range"
          />
          {[bandTop, bandBottom].map((at) => (
            <line
              key={at}
              x1={LEFT}
              x2={LEFT + PLOT_W}
              y1={at}
              y2={at}
              strokeWidth={1}
              className="stroke-range-line"
            />
          ))}

          <text
            x={0}
            y={ICON_Y}
            fontSize={FONT}
            dominantBaseline="middle"
            className="fill-ink-soft"
          >
            mg/dL
          </text>
          {chartGuides(top).map((mgdl) => {
            const at = y(mgdl)
            // A guide too close to 70 or 180 keeps its line, not its label.
            const labeled =
              Math.abs(at - bandTop) >= FONT &&
              Math.abs(at - bandBottom) >= FONT
            return (
              <g key={mgdl}>
                <line
                  x1={LEFT}
                  x2={LEFT + PLOT_W}
                  y1={at}
                  y2={at}
                  strokeWidth={1}
                  className="stroke-line"
                />
                {labeled ? <AxisLabel y={at}>{mgdl}</AxisLabel> : null}
              </g>
            )
          })}
          <AxisLabel y={bandTop} strong>
            {BAND_HIGH_MGDL}
          </AxisLabel>
          <AxisLabel y={bandBottom} strong>
            {BAND_LOW_MGDL}
          </AxisLabel>

          {hours.map((hour) => {
            const at = x(hour.time)
            // The ones at the left edge do not go out of the drawing.
            const anchor = at - LEFT < 14 ? 'start' : 'middle'
            return (
              <g key={hour.time}>
                <line
                  x1={at}
                  x2={at}
                  y1={TOP}
                  y2={TOP + PLOT_H}
                  strokeWidth={1}
                  className="stroke-line"
                />
                {hour.label !== null ? (
                  <text
                    x={at}
                    y={HEIGHT - 6}
                    fontSize={FONT}
                    textAnchor={anchor}
                    className="fill-ink-soft tabular-nums"
                  >
                    {hour.label}
                  </text>
                ) : null}
              </g>
            )
          })}
          <text
            x={LEFT + PLOT_W}
            y={HEIGHT - 6}
            fontSize={FONT}
            textAnchor="end"
            className="fill-ink-soft"
          >
            ahora
          </text>
          <line
            x1={LEFT}
            x2={LEFT + PLOT_W}
            y1={TOP + PLOT_H}
            y2={TOP + PLOT_H}
            strokeWidth={1}
            className="stroke-line-strong"
          />

          {marks.map((time, index) => (
            <line
              key={`${time}-${index}`}
              x1={x(time)}
              x2={x(time)}
              y1={ICON_Y + ICON_R}
              y2={TOP + PLOT_H}
              strokeWidth={1}
              strokeDasharray="3 3"
              className="stroke-line-strong"
            />
          ))}
          {icons.map((at, index) => (
            <g key={`${marks[index]}-${index}`}>
              <circle
                cx={at}
                cy={ICON_Y}
                r={ICON_R}
                strokeWidth={1}
                className="fill-accent-soft stroke-surface"
              />
              <Utensils
                x={at - ICON_SIZE / 2}
                y={ICON_Y - ICON_SIZE / 2}
                size={ICON_SIZE}
                strokeWidth={2}
                className="text-accent"
              />
            </g>
          ))}

          {bridges.map(({ from, to }) => (
            <line
              key={from.time}
              x1={x(from.time) + 4}
              x2={x(to.time) - 4}
              y1={y(from.mgdl)}
              y2={y(from.mgdl)}
              strokeWidth={1}
              strokeDasharray="2 4"
              className="stroke-line-strong"
            />
          ))}

          {segments.map((segment) =>
            segment.length === 1 && segment[0] !== undefined ? (
              <circle
                key={segment[0].time}
                cx={x(segment[0].time)}
                cy={y(segment[0].mgdl)}
                r={2.5}
                className="fill-accent"
              />
            ) : (
              <polyline
                key={segment[0]?.time}
                points={segment
                  .map((point) => `${x(point.time)},${y(point.mgdl)}`)
                  .join(' ')}
                fill="none"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="stroke-accent"
              />
            ),
          )}

          {extremeLabels.map(({ point, above }) => {
            const at = y(point.mgdl)
            // Above the highest and below the lowest, unless it would go
            // out of the plot.
            const labelAbove = above
              ? at - 8 >= TOP + FONT
              : at + 18 > TOP + PLOT_H
            return (
              <g key={`${above}`}>
                <circle
                  cx={x(point.time)}
                  cy={at}
                  r={3}
                  className="fill-accent"
                />
                <text
                  x={Math.min(
                    LEFT + PLOT_W - 12,
                    Math.max(LEFT + 12, x(point.time)),
                  )}
                  y={labelAbove ? at - 8 : at + 18}
                  fontSize={FONT}
                  textAnchor="middle"
                  className="fill-ink font-semibold tabular-nums"
                >
                  {point.mgdl}
                </text>
              </g>
            )
          })}

          {last !== undefined ? (
            <circle
              cx={x(last.time)}
              cy={y(last.mgdl)}
              r={5}
              strokeWidth={2}
              className={
                lastStale
                  ? 'fill-surface stroke-ink-soft'
                  : 'fill-accent stroke-surface'
              }
            />
          ) : null}

          {pick !== null && pickTime !== null ? (
            <g>
              <line
                x1={x(pickTime)}
                x2={x(pickTime)}
                y1={TOP}
                y2={TOP + PLOT_H}
                strokeWidth={1.5}
                className="stroke-ink"
              />
              {pick.kind === 'reading' ? (
                <circle
                  cx={x(pick.point.time)}
                  cy={y(pick.point.mgdl)}
                  r={6}
                  strokeWidth={2}
                  className="fill-accent stroke-surface"
                />
              ) : null}
            </g>
          ) : null}
        </svg>
      </div>
      <p id={descriptionId} className="sr-only">
        {description}
      </p>
      <Legend />
    </div>
  )
}

/** What VoiceOver says of the slider: the picked reading, or the last. */
function valueText(
  pick: ChartPick | null,
  meal: number | null,
  last: ChartPoint | undefined,
): string | undefined {
  const withMeal = (text: string) =>
    meal === null ? text : `${text}. ${chartMealText(meal)}`
  if (pick?.kind === 'reading') {
    return withMeal(chartReadingValueText(pick.point.time, pick.point.mgdl))
  }
  if (pick?.kind === 'gap') {
    return withMeal(
      chartGapText(pick.before?.time ?? null, pick.after?.time ?? null),
    )
  }
  return last === undefined
    ? undefined
    : chartReadingValueText(last.time, last.mgdl)
}

type AxisLabelProps = { y: number; strong?: boolean; children: number }

/** A value on the left of the chart; 70 and 180 in semibold. */
function AxisLabel({ y, strong = false, children }: AxisLabelProps) {
  return (
    <text
      x={LEFT - 6}
      y={y}
      fontSize={FONT}
      textAnchor="end"
      dominantBaseline="middle"
      className={`fill-ink-soft tabular-nums ${strong ? 'font-semibold' : ''}`}
    >
      {children}
    </text>
  )
}

type PickedReadingProps = { pick: ChartPick | null; meal: number | null }

/**
 * The row on top of the chart (44 px, kept so nothing jumps): the picked
 * reading with its time, or a gap, and a meal close to it; without a pick,
 * how to use the chart. Never confused with the current value: it always
 * says its time.
 */
function PickedReading({ pick, meal }: PickedReadingProps) {
  const mealText =
    meal === null ? null : (
      <span className="text-sm text-ink-soft">· {chartMealText(meal)}</span>
    )
  return (
    <div
      aria-hidden="true"
      className="flex min-h-11 flex-wrap items-baseline gap-x-2"
    >
      {pick === null ? (
        <p className="self-center text-sm text-ink-soft">
          {GLUCOSE_CHART_HINT}
        </p>
      ) : pick.kind === 'reading' ? (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-2xl font-semibold text-ink tabular-nums">
            {pick.point.mgdl}
          </span>
          <span className="text-sm text-ink">mg/dL</span>
          <span className="text-sm text-ink-soft tabular-nums">
            · {chartAtText(pick.point.time)}
          </span>
          {mealText}
        </p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-2 self-center">
          <span className="text-base text-ink">
            {chartGapText(pick.before?.time ?? null, pick.after?.time ?? null)}
          </span>
          {mealText}
        </p>
      )}
    </div>
  )
}

/** What the band and the icons are, in sight (UX-34). */
function Legend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-4 rounded-xs border border-range-line bg-range"
        />
        {GLUCOSE_CHART_BAND_LEGEND}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent"
        >
          <Utensils className="size-3" strokeWidth={2} />
        </span>
        {GLUCOSE_CHART_MEAL_LEGEND}
      </span>
    </p>
  )
}
