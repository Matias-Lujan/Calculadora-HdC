import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
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
  glucoseRetryText,
} from '../glucose.ts'
import {
  SPARKLINE_WINDOW_MS,
  withLatest,
  type ChartReading,
} from '../glucoseChart.ts'
import type { GlucoseReading } from '../types.ts'
import { useNow } from '../useNow.ts'
import { GlucoseNow } from './GlucoseNow.tsx'
import { GlucoseSparkline } from './GlucoseSparkline.tsx'

type ShellProps = { children: ReactNode }

/**
 * The box, in every state: all of it opens the 24-hour chart (spec §6.10).
 * The link is the title, stretched over the box with an ::after; the ⓘ
 * comes after it in the page and is positioned (InfoTip), so it is drawn
 * over the link and still opens its explanation. Nothing else inside can
 * be tapped.
 */
function GlucoseCardShell({ children }: ShellProps) {
  return (
    <div
      className={`${card} relative flex flex-col gap-1 pr-10 has-[a:active]:brightness-95`}
    >
      <div className="flex flex-wrap items-center gap-x-2">
        <h2 className="text-sm font-medium text-ink-soft">
          <Link
            to="/glucose"
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
          >
            Glucosa del sensor
            <span className="sr-only">. Ver las últimas 24 horas</span>
          </Link>
        </h2>
        <InfoTip text={GLUCOSE_INFO} />
      </div>
      {children}
      <ChevronRight
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-6 -translate-y-1/2 text-ink-soft"
      />
    </div>
  )
}

type Props = {
  /** undefined while it never loaded; null if the sensor has no reading. */
  reading: GlucoseReading | null | undefined
  error: unknown
  isPending: boolean
  /**
   * The saved readings of the last 24 hours, for the small curve
   * (UX-35); undefined while they never loaded or if they fail: Inicio
   * does not wait for them, and the box goes without the curve.
   */
  readings: readonly ChartReading[] | undefined
}

/**
 * The glucose of the sensor on Inicio (spec §6.9), only as a reference: it
 * never goes into the calculation. Without range colors on the value (red,
 * amber and green are for errors, warnings and saving); beside it, the
 * curve of the last 3 hours. For a user without the glucose set up,
 * nothing is shown.
 */
export function GlucoseCard({ reading, error, isPending, readings }: Props) {
  const now = useNow()
  if (
    error instanceof GlucoseError &&
    error.code === 'GLUCOSE_NOT_CONFIGURED'
  ) {
    return null
  }

  // First load: a gray shape the size of the value and its time.
  if (isPending) {
    return (
      <GlucoseCardShell>
        <div aria-hidden="true" className="h-16 rounded-lg bg-sunken" />
      </GlucoseCardShell>
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
      <GlucoseCardShell>
        <p className="text-base text-ink-soft">{message}</p>
        {retry}
      </GlucoseCardShell>
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
      <GlucoseCardShell>
        <p className="text-base text-ink-soft">{GLUCOSE_NO_READING_TEXT}</p>
        {updateFailed}
      </GlucoseCardShell>
    )
  }

  return (
    <GlucoseCardShell>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <GlucoseNow reading={reading} now={now} />
        </div>
        {readings !== undefined ? (
          <GlucoseSparkline
            readings={withLatest(readings, reading, now)}
            now={now}
            windowMs={SPARKLINE_WINDOW_MS}
          />
        ) : null}
      </div>
      {updateFailed}
    </GlucoseCardShell>
  )
}
