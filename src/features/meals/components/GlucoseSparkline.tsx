import { isStaleReading } from '../glucose.ts'
import {
  BAND_HIGH_MGDL,
  BAND_LOW_MGDL,
  chartPoints,
  chartSegments,
  chartX,
  chartY,
  sparklineScale,
  type ChartReading,
} from '../glucoseChart.ts'

type Props = {
  /** The readings to draw; only the ones of the window go in. */
  readings: readonly ChartReading[]
  /** The end of the window, in ms. */
  now: number
  /** How long the window is, in ms. */
  windowMs: number
}

// In units of the viewBox, the size it has on screen (96 × 40 px).
const WIDTH = 96
const HEIGHT = 40
const PAD = 4

/**
 * The small curve of the glucose box of Inicio (UX-35): the line of the
 * last hours, the point of now and the band, without axes nor numbers (the
 * number is beside it). Only props, hidden from screen readers (the box
 * already says what it opens). Gray when the last reading is old; nothing
 * without readings.
 */
export function GlucoseSparkline({ readings, now, windowMs }: Props) {
  const points = chartPoints(readings, now, windowMs)
  const last = points.at(-1)
  if (last === undefined) return null
  const { bottom, top } = sparklineScale(points)
  const x = (time: number) => PAD + chartX(time, now, WIDTH - 2 * PAD, windowMs)
  const y = (mgdl: number) => PAD + chartY(mgdl, top, HEIGHT - 2 * PAD, bottom)
  const stale = isStaleReading(Math.floor((now - last.time) / 60_000))
  const stroke = stale ? 'stroke-ink-soft' : 'stroke-accent'

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
      className="pointer-events-none h-10 w-24 shrink-0"
    >
      <rect
        x={PAD}
        y={y(BAND_HIGH_MGDL)}
        width={WIDTH - 2 * PAD}
        height={y(BAND_LOW_MGDL) - y(BAND_HIGH_MGDL)}
        rx={2}
        className="fill-range"
      />
      {chartSegments(points).map((segment) =>
        segment.length === 1 && segment[0] !== undefined ? (
          <circle
            key={segment[0].time}
            cx={x(segment[0].time)}
            cy={y(segment[0].mgdl)}
            r={1.5}
            className={stale ? 'fill-ink-soft' : 'fill-accent'}
          />
        ) : (
          <polyline
            key={segment[0]?.time}
            points={segment
              .map((point) => `${x(point.time)},${y(point.mgdl)}`)
              .join(' ')}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={stroke}
          />
        ),
      )}
      <circle
        cx={x(last.time)}
        cy={y(last.mgdl)}
        r={3.5}
        strokeWidth={1.5}
        className={
          stale ? 'fill-surface stroke-ink-soft' : 'fill-accent stroke-surface'
        }
      />
    </svg>
  )
}
