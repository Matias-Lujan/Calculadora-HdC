import { Utensils } from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from 'react'
import {
  GLUCOSE_CHART_LABEL,
  chartGapText,
  chartMealText,
  chartReadingValueText,
  clockText,
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

// The drawing, in real px (UX-37): its box grows with the free height of
// the screen, between 260 and 520 px, and the viewBox is what it measures,
// so the text never stretches. Edge to edge (UX-38): the axis labels and
// "mg/dL" end at 52, right-aligned (UX-43), so "mg/dL" (about 36 px wide
// at 13 px) starts about where the text of the page does, and the plot
// ends 16 px before the edge. The row on top (40 px, UX-46) holds "mg/dL",
// the meal icons and, after a tap, the bubble of the picked reading.
const LEFT = 58
const RIGHT = 16
const TOP = 40
const BOTTOM = 26
const FONT = 13
const ICON_Y = 20
const ICON_R = 11
const ICON_SIZE = 14
// The bubble goes from 4 to 36 px; the line of the pick starts under it.
const BUBBLE_BOTTOM = 36
// A guide closer than this to 70 or 180 keeps its line, not its number
// (UX-44): 11 px of air with 13 px text, so they read as two.
const LABEL_CLEARANCE = 24
// The bubble keeps this far from the sides of the drawing.
const BUBBLE_EDGE = 8
// A meal icon closer than this to the bubble is hidden while it shows.
const BUBBLE_AIR = 4

type BubbleSpan = { left: number; width: number }

type BoxSize = { width: number; height: number }

// Until the box is measured (or where it cannot be, as in the tests), the
// drawing takes this size.
const DEFAULT_SIZE: BoxSize = { width: 360, height: 260 }

/**
 * The size of an element in px, kept up to date with a ResizeObserver. The
 * first measure is taken before the first paint, so the drawing does not
 * jump; without one (no ResizeObserver, or not laid out), the fallback.
 */
function useBoxSize<T extends HTMLElement>(fallback: BoxSize) {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<BoxSize | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const update = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      setSize((current) =>
        current !== null && current.width === width && current.height === height
          ? current
          : { width, height },
      )
    }
    const rect = element.getBoundingClientRect()
    update(rect.width, rect.height)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        update(entry.contentRect.width, entry.contentRect.height)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size ?? fallback] as const
}

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
 * with its own color (not the green of "guardado"); guides every 50 from
 * 100 (UX-44); the line, cut where readings are missing; the point of now
 * and the lowest and highest values; and a mark with a fork and knife at
 * each meal, without carbs nor dose. Touching or dragging over it shows
 * the closest reading and its time in a bubble on top, joined to the
 * vertical line (UX-29, UX-46); for VoiceOver and the keyboard it is
 * adjustable, one reading at a time. It fills the width and the height of
 * its container (a flex column): made for a panel from edge to edge.
 */
export function GlucoseChart({ readings, mealTimes, now, windowMs }: Props) {
  const [picked, setPicked] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [boxRef, box] = useBoxSize<HTMLDivElement>(DEFAULT_SIZE)
  const plotW = box.width - LEFT - RIGHT
  const plotH = box.height - TOP - BOTTOM
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
  const hours = chartHours(now, windowMs, plotW)
  const extremes = chartExtremes(points)
  const last = points.at(-1)
  const x = (time: number) => LEFT + chartX(time, now, plotW, windowMs)
  const y = (mgdl: number) => TOP + chartY(mgdl, top, plotH)
  const bandTop = y(BAND_HIGH_MGDL)
  const bandBottom = y(BAND_LOW_MGDL)
  // Inside the plot, like everything else of the drawing (UX-51).
  const icons = spreadMarks(
    marks.map(x),
    ICON_R + 1,
    LEFT + ICON_R,
    LEFT + plotW - ICON_R,
  )
  const description = chartDescription(points, marks.length, windowMs)

  const pick = picked === null ? null : pickAt(points, picked)
  const pickTime =
    pick === null ? null : pick.kind === 'reading' ? pick.point.time : picked
  const meal = pickTime === null ? null : mealNear(marks, pickTime)
  const pickX = pickTime === null ? null : x(pickTime)

  // The bubble, centered on the line of the pick but inside the drawing.
  // Placed before the paint each time what it shows or where it goes
  // changes, so it does not jump when its width changes ("Sin lecturas
  // entre…" is longer than a value).
  const bubbleRef = useRef<HTMLDivElement>(null)
  // Where the bubble is, so the meal icons and "mg/dL" under it step aside.
  const [bubbleSpan, setBubbleSpan] = useState<BubbleSpan | null>(null)
  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (bubble === null || pickX === null) return
    const width = bubble.offsetWidth
    const left = Math.max(
      BUBBLE_EDGE,
      Math.min(pickX - width / 2, box.width - BUBBLE_EDGE - width),
    )
    bubble.style.left = `${left}px`
    setBubbleSpan((current) =>
      current !== null && current.left === left && current.width === width
        ? current
        : { left, width },
    )
    // `picked`, `meal` and `readings` change what the bubble says, so its
    // width.
  }, [pickX, box.width, picked, meal, readings])
  const span = pick !== null ? bubbleSpan : null
  // An icon too close to the bubble is not drawn: half covered, it reads
  // as a broken drawing. Its dashed line stays, from under the bubble.
  const underBubble = (cx: number) =>
    span !== null &&
    cx + ICON_R > span.left - BUBBLE_AIR &&
    cx - ICON_R < span.left + span.width + BUBBLE_AIR
  const hiddenIcons = icons.map(underBubble)
  const unitHidden = span !== null && span.left < LEFT

  const timeAt = (event: PointerEvent<HTMLDivElement>) => {
    // In px of the drawing: the viewBox is the measured box, so the scale
    // is 1 (it only matters while the drawing has the fallback size).
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = rect.width > 0 ? box.width / rect.width : 1
    const across = (event.clientX - rect.left) * scale - LEFT
    return chartTime(across, now, plotW, windowMs)
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
    <div ref={rootRef} className="flex flex-1 flex-col">
      {/* Only the drawing grows, between 260 and 520 px (UX-37). */}
      <div
        ref={boxRef}
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
        className="relative max-h-[520px] min-h-[260px] flex-1 cursor-crosshair touch-pan-y rounded-control select-none"
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
          viewBox={`0 0 ${box.width} ${box.height}`}
          aria-hidden="true"
          className="absolute inset-0 block size-full"
        >
          <rect
            x={LEFT}
            y={bandTop}
            width={plotW}
            height={bandBottom - bandTop}
            className="fill-range"
          />
          {[bandTop, bandBottom].map((at) => (
            <line
              key={at}
              x1={LEFT}
              x2={LEFT + plotW}
              y1={at}
              y2={at}
              strokeWidth={1}
              className="stroke-range-line"
            />
          ))}

          {/* The label of the column of numbers, right-aligned with them. */}
          {unitHidden ? null : (
            <text
              x={LEFT - 6}
              y={ICON_Y}
              fontSize={FONT}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-soft"
            >
              mg/dL
            </text>
          )}
          {chartGuides(top).map((mgdl) => {
            const at = y(mgdl)
            // A guide too close to 70 or 180 keeps its line, not its label.
            const labeled =
              Math.abs(at - bandTop) >= LABEL_CLEARANCE &&
              Math.abs(at - bandBottom) >= LABEL_CLEARANCE
            return (
              <g key={mgdl}>
                <line
                  x1={LEFT}
                  x2={LEFT + plotW}
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
                  y2={TOP + plotH}
                  strokeWidth={1}
                  className="stroke-line"
                />
                {hour.label !== null ? (
                  <text
                    x={at}
                    y={box.height - 7}
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
          {/* The time of now (UX-45): "ahora" is already said above. */}
          <text
            x={LEFT + plotW}
            y={box.height - 7}
            fontSize={FONT}
            textAnchor="end"
            className="fill-ink-soft tabular-nums"
          >
            {clockText(now)}
          </text>
          <line
            x1={LEFT}
            x2={LEFT + plotW}
            y1={TOP + plotH}
            y2={TOP + plotH}
            strokeWidth={1}
            className="stroke-line-strong"
          />

          {marks.map((time, index) => (
            <line
              key={`${time}-${index}`}
              x1={x(time)}
              x2={x(time)}
              y1={hiddenIcons[index] === true ? BUBBLE_BOTTOM : ICON_Y + ICON_R}
              y2={TOP + plotH}
              strokeWidth={1}
              strokeDasharray="3 3"
              className="stroke-line-strong"
            />
          ))}
          {icons.map((at, index) =>
            hiddenIcons[index] === true ? null : (
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
            ),
          )}

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
              : at + 18 > TOP + plotH
            return (
              <g key={`${above}`}>
                <circle
                  cx={x(point.time)}
                  cy={at}
                  r={3.5}
                  className="fill-accent"
                />
                <text
                  x={Math.min(
                    LEFT + plotW - 12,
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
              r={6}
              strokeWidth={2.5}
              className={
                lastStale
                  ? 'fill-surface stroke-ink-soft'
                  : 'fill-accent stroke-surface'
              }
            />
          ) : null}

          {pick !== null && pickX !== null ? (
            <g>
              {/* From the bottom of the bubble to the axis (UX-46). */}
              <line
                x1={pickX}
                x2={pickX}
                y1={BUBBLE_BOTTOM}
                y2={TOP + plotH}
                strokeWidth={1.5}
                className="stroke-ink"
              />
              {pick.kind === 'reading' ? (
                <circle
                  cx={x(pick.point.time)}
                  cy={y(pick.point.mgdl)}
                  r={7}
                  strokeWidth={2}
                  className="fill-accent stroke-surface"
                />
              ) : null}
            </g>
          ) : null}
        </svg>
        {pick !== null ? (
          <PickedBubble ref={bubbleRef} pick={pick} meal={meal} />
        ) : null}
      </div>
      <p id={descriptionId} className="sr-only">
        {description}
      </p>
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

type PickedBubbleProps = {
  ref: Ref<HTMLDivElement>
  pick: ChartPick
  meal: number | null
}

/**
 * The picked reading with its time, or a gap, and a meal close to it, in a
 * bubble on top of the drawing (UX-46), joined to the vertical line. HTML,
 * so it grows with the letter size; it takes two lines if it has to,
 * growing down over the drawing without moving anything. Dark on the
 * light chart, so it is never confused with the current value above.
 * Hidden from VoiceOver: the slider already says the same.
 */
function PickedBubble({ ref, pick, meal }: PickedBubbleProps) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute top-1 z-10 flex min-h-8 w-max max-w-[calc(100%-16px)] flex-wrap items-baseline gap-x-1.5 rounded-full bg-ink px-3 py-1 text-surface shadow-level-1"
    >
      {pick.kind === 'reading' ? (
        <>
          <span className="font-display text-base font-semibold tabular-nums">
            {pick.point.mgdl}
          </span>
          <span className="text-xs">mg/dL</span>
          <span className="text-xs tabular-nums">
            · {clockText(pick.point.time)}
          </span>
        </>
      ) : (
        <span className="text-xs">
          {chartGapText(pick.before?.time ?? null, pick.after?.time ?? null)}
        </span>
      )}
      {meal !== null ? (
        <span className="text-xs tabular-nums">
          ·{' '}
          <Utensils
            aria-hidden="true"
            className="inline size-3.5 align-[-2px]"
          />{' '}
          {clockText(meal)}
        </span>
      ) : null}
    </div>
  )
}
