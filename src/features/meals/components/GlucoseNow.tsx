import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'
import {
  GLUCOSE_STALE_TEXT,
  glucoseAgoText,
  isStaleReading,
  minutesSince,
  trendLabel,
} from '../glucose.ts'
import type { GlucoseReading } from '../types.ts'

type Trend = NonNullable<GlucoseReading['trend']>

const TREND_ICONS: Record<Trend, LucideIcon> = {
  falling_fast: ArrowDown,
  falling: ArrowDownRight,
  steady: ArrowRight,
  rising: ArrowUpRight,
  rising_fast: ArrowUp,
}

type Props = {
  reading: GlucoseReading
  /** The time now, in ms, for "hace 3 min". */
  now: number
}

/**
 * The current glucose (spec §6.9 and §6.10): the value in big, "mg/dL",
 * the arrow of the trend and when it was measured. The same on Inicio and
 * on the chart (UX-28). A reading of more than 15 minutes goes in gray,
 * without arrow, and says that it may not be the current one. Only a
 * reference: it never goes into the calculation.
 */
export function GlucoseNow({ reading, now }: Props) {
  const minutes = minutesSince(reading.measured_at, now)
  const stale = isStaleReading(minutes)
  const Arrow =
    !stale && reading.trend !== null ? TREND_ICONS[reading.trend] : null
  const ago = glucoseAgoText(minutes)

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p
        className={`flex items-baseline gap-1.5 ${stale ? 'text-ink-soft' : 'text-ink'}`}
      >
        <span className="font-display text-4xl leading-none font-bold tabular-nums">
          {reading.mgdl}
        </span>
        <span className="text-base">mg/dL</span>
        {Arrow !== null && reading.trend !== null ? (
          <Arrow
            role="img"
            aria-label={trendLabel(reading.trend)}
            className="ml-0.5 size-7 self-center"
          />
        ) : null}
      </p>
      <p className="text-sm text-ink-soft">
        {stale ? `${ago} · ${GLUCOSE_STALE_TEXT}` : ago}
      </p>
    </div>
  )
}
