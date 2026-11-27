import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { card } from '../../../components/styles.ts'
import {
  GLUCOSE_READ_ERROR_MESSAGE,
  GLUCOSE_UPDATE_ERROR_MESSAGE,
  GlucoseError,
  glucoseErrorMessage,
} from '../../../lib/errors.ts'
import {
  GLUCOSE_INFO,
  GLUCOSE_NO_READING_TEXT,
  GLUCOSE_STALE_TEXT,
  glucoseAgoText,
  glucoseRetryText,
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

/** How often "hace X min" is brought up to date. */
const CLOCK_MS = 15_000

/**
 * The time now, brought up to date every 15 s and when the app comes back
 * in sight, so "hace X min" does not stay behind while the reading does not
 * change.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, CLOCK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}

type Props = {
  /** undefined while it never loaded; null if the sensor has no reading. */
  reading: GlucoseReading | null | undefined
  error: unknown
  isPending: boolean
}

/**
 * The glucose of the sensor on Inicio (spec §6.9), only as a reference: it
 * never goes into the calculation. Without range colors (red, amber and
 * green are for errors, warnings and saving). For a user without the
 * glucose set up, nothing is shown.
 */
export function GlucoseCard({ reading, error, isPending }: Props) {
  const now = useNow()
  if (
    error instanceof GlucoseError &&
    error.code === 'GLUCOSE_NOT_CONFIGURED'
  ) {
    return null
  }

  const title = (
    <div className="flex flex-wrap items-center gap-x-2">
      <h2 className="text-sm font-medium text-ink-soft">Glucosa del sensor</h2>
      <InfoTip text={GLUCOSE_INFO} />
    </div>
  )

  // First load: a gray shape the size of the value and its time.
  if (isPending) {
    return (
      <div className={`${card} flex flex-col gap-1`}>
        {title}
        <div aria-hidden="true" className="h-16 rounded-lg bg-sunken" />
      </div>
    )
  }

  // While the function waits after a failed login: when it tries again.
  const retryText =
    error instanceof GlucoseError && error.retryAt !== null
      ? glucoseRetryText(error.retryAt)
      : null
  const retry =
    retryText !== null ? (
      <p className="text-sm text-ink-soft">{retryText}</p>
    ) : null

  if (reading === undefined) {
    // Never loaded: only the message.
    const message =
      error instanceof GlucoseError && error.code !== 'GLUCOSE_NOT_CONFIGURED'
        ? glucoseErrorMessage(error.code)
        : GLUCOSE_READ_ERROR_MESSAGE
    return (
      <div className={`${card} flex flex-col gap-1`}>
        {title}
        <p className="text-base text-ink-soft">{message}</p>
        {retry}
      </div>
    )
  }

  const updateFailed =
    error !== null && error !== undefined ? (
      <>
        <p className="text-sm text-ink-soft">{GLUCOSE_UPDATE_ERROR_MESSAGE}</p>
        {retry}
      </>
    ) : null

  if (reading === null) {
    return (
      <div className={`${card} flex flex-col gap-1`}>
        {title}
        <p className="text-base text-ink-soft">{GLUCOSE_NO_READING_TEXT}</p>
        {updateFailed}
      </div>
    )
  }

  const minutes = minutesSince(reading.measured_at, now)
  const stale = isStaleReading(minutes)
  const Arrow =
    !stale && reading.trend !== null ? TREND_ICONS[reading.trend] : null
  const ago = glucoseAgoText(minutes)

  return (
    <div className={`${card} flex flex-col gap-1`}>
      {title}
      <p
        className={`flex items-center gap-2 ${stale ? 'text-ink-soft' : 'text-ink'}`}
      >
        <span className="font-display text-4xl leading-none font-bold tabular-nums">
          {reading.mgdl}
        </span>
        <span className="text-base">mg/dL</span>
        {Arrow !== null && reading.trend !== null ? (
          <Arrow
            role="img"
            aria-label={trendLabel(reading.trend)}
            className="size-7"
          />
        ) : null}
      </p>
      <p className="text-sm text-ink-soft">
        {stale ? `${ago} · ${GLUCOSE_STALE_TEXT}` : ago}
      </p>
      {updateFailed}
    </div>
  )
}
