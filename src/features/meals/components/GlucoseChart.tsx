import {
  BAND_HIGH_MGDL,
  BAND_LOW_MGDL,
  chartDescription,
  chartHours,
  chartPoints,
  chartSegments,
  chartTop,
  chartX,
  chartY,
  mealMarkTimes,
  type ChartReading,
} from '../glucoseChart.ts'

type Props = {
  /** The readings to draw; only the ones of the last 24 hours go in. */
  readings: readonly ChartReading[]
  /** When each saved meal was eaten (ISO); one mark for each. */
  mealTimes: readonly string[]
  /** The end of the window, in ms. */
  now: number
}

// The drawing, in units of the viewBox: it takes the whole width and keeps
// its proportions (about 220 px high on an iPhone).
const WIDTH = 320
const HEIGHT = 220
const LEFT = 32
const RIGHT = 10
const TOP = 10
const BOTTOM = 24
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM
const FONT = 12

/**
 * The glucose of the last 24 hours (spec §6.10), drawn by hand in SVG. Only
 * props, so it can go on any screen. A gray band from 70 to 180 mg/dL, the
 * same for everybody and without range colors (red, amber and green are
 * for errors, warnings and saving); the line, cut where readings are
 * missing; and a dashed mark at the time of each meal, without carbs nor
 * dose.
 */
export function GlucoseChart({ readings, mealTimes, now }: Props) {
  const points = chartPoints(readings, now)
  const segments = chartSegments(points)
  const top = chartTop(points)
  const marks = mealMarkTimes(mealTimes, now)
  const hours = chartHours(now)
  const x = (time: number) => LEFT + chartX(time, now, PLOT_W)
  const y = (mgdl: number) => TOP + chartY(mgdl, top, PLOT_H)
  const bandTop = y(BAND_HIGH_MGDL)
  const bandBottom = y(BAND_LOW_MGDL)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={chartDescription(points, marks.length)}
      className="block h-auto w-full"
    >
      <rect
        x={LEFT}
        y={bandTop}
        width={PLOT_W}
        height={bandBottom - bandTop}
        className="fill-sunken stroke-line"
      />
      {[BAND_HIGH_MGDL, BAND_LOW_MGDL].map((mgdl) => (
        <text
          key={mgdl}
          x={LEFT - 6}
          y={y(mgdl)}
          fontSize={FONT}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-ink-soft tabular-nums"
        >
          {mgdl}
        </text>
      ))}

      {hours.map((hour) => {
        const at = x(hour.time)
        // The ones at the edges do not go out of the drawing.
        const anchor =
          at - LEFT < 14 ? 'start' : LEFT + PLOT_W - at < 14 ? 'end' : 'middle'
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
            <text
              x={at}
              y={HEIGHT - 6}
              fontSize={FONT}
              textAnchor={anchor}
              className="fill-ink-soft tabular-nums"
            >
              {hour.label}
            </text>
          </g>
        )
      })}
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
          y1={TOP}
          y2={TOP + PLOT_H}
          strokeWidth={1.5}
          strokeDasharray="3 3"
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
    </svg>
  )
}
