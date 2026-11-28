import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { LoadingShapes } from '../../../components/LoadingShapes.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { backLink, button, segmented } from '../../../components/styles.ts'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { GlucoseChart } from '../components/GlucoseChart.tsx'
import { GlucoseNow } from '../components/GlucoseNow.tsx'
import {
  GLUCOSE_CHART_EMPTY_HINT,
  GLUCOSE_CHART_EMPTY_TEXT,
  GLUCOSE_CHART_INFO,
  GLUCOSE_CHART_PERIODS_LABEL,
  GLUCOSE_CHART_PERIOD_EMPTY_HINT,
  GLUCOSE_CHART_TITLE,
  chartPeriodEmptyText,
  chartPeriodText,
} from '../glucose.ts'
import {
  CHART_PERIODS_MS,
  CHART_WINDOW_MS,
  HOUR_MS,
  chartPoints,
  withLatest,
} from '../glucoseChart.ts'
import { useGlucoseDay, useLatestGlucose, useMealMarks } from '../queries.ts'
import { useNow } from '../useNow.ts'

/**
 * The glucose of the last hours (`/glucose`, spec §6.10), opened from the
 * box of Inicio. Only a reference: it never goes into the calculation
 * (CLAUDE.md, rule 7). On top, the current value (as on Inicio); then the
 * period (3, 6, 12 or 24 hours, always starting at 24) and the chart: the
 * saved readings, plus the live one when it is newer, and a mark for each
 * meal saved in those hours.
 */
export function GlucoseChartPage() {
  const day = useGlucoseDay()
  const marks = useMealMarks()
  const latest = useLatestGlucose()
  const now = useNow()
  const [windowMs, setWindowMs] = useState<number>(CHART_WINDOW_MS)
  const hours = windowMs / HOUR_MS

  // With data, the chart stays even if a later refetch fails.
  const queries = [day, marks]
  const failed = queries.filter(
    (query) => query.data === undefined && query.isError,
  )

  let body
  if (day.data !== undefined && marks.data !== undefined) {
    const readings = withLatest(day.data, latest.data, now)
    if (chartPoints(readings, now, CHART_WINDOW_MS).length === 0) {
      body = (
        <EmptyChart
          text={GLUCOSE_CHART_EMPTY_TEXT}
          hint={GLUCOSE_CHART_EMPTY_HINT}
        />
      )
    } else if (chartPoints(readings, now, windowMs).length === 0) {
      body = (
        <EmptyChart
          text={chartPeriodEmptyText(hours)}
          hint={GLUCOSE_CHART_PERIOD_EMPTY_HINT}
        />
      )
    } else {
      body = (
        // A new period draws the chart again, with a short fade, and takes
        // the picked reading away.
        <div key={windowMs} className={`${panel} motion-safe:animate-fade`}>
          <GlucoseChart
            readings={readings}
            mealTimes={marks.data}
            now={now}
            windowMs={windowMs}
          />
        </div>
      )
    }
  } else if (failed.length > 0) {
    body = (
      <div className="flex flex-col gap-3">
        <Notice tone="error" role="alert">
          <p>{LOAD_ERROR_MESSAGE}</p>
        </Notice>
        <button
          type="button"
          className={`${button.secondary} self-start`}
          disabled={failed.some((query) => query.isFetching)}
          onClick={() => {
            for (const query of failed) void query.refetch()
          }}
        >
          Reintentar
        </button>
      </div>
    )
  } else {
    // The chart, in its panel.
    body = <LoadingShapes shapes={['min-h-86']} />
  }

  return (
    // Just the visible height (UX-37): the 24 and 96 px that <main> leaves
    // above and below, and the safe areas, are taken out. svh, so the chart
    // does not change size while Safari hides or shows its bars.
    <section className="flex min-h-[calc(100svh-120px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col gap-3">
      {/* One row on top (UX-39): back, and the title small in the middle,
          with its ⓘ; the explanation of the ⓘ takes the whole row below. */}
      <div className="grid min-h-11 grid-cols-[1fr_auto_auto_1fr] items-center gap-x-2 [&>p]:col-span-full">
        <Link to="/" className={`${backLink} justify-self-start`}>
          <ChevronLeft aria-hidden="true" className="shrink-0" />
          Inicio
        </Link>
        <h1 className="text-center font-display text-base font-semibold">
          {GLUCOSE_CHART_TITLE}
        </h1>
        <InfoTip text={GLUCOSE_CHART_INFO} />
      </div>
      {/* The current value never changes while a reading is picked. */}
      {latest.data !== undefined && latest.data !== null ? (
        <GlucoseNow reading={latest.data} now={now} />
      ) : null}
      <div
        role="group"
        aria-label={GLUCOSE_CHART_PERIODS_LABEL}
        className={segmented.group}
      >
        {CHART_PERIODS_MS.map((period) => {
          const text = chartPeriodText(period / HOUR_MS)
          return (
            <button
              key={period}
              type="button"
              aria-pressed={period === windowMs}
              className={`${segmented.option} ${segmented.pressed} tabular-nums`}
              onClick={() => setWindowMs(period)}
            >
              <span aria-hidden="true">{text.short}</span>
              <span className="sr-only">{text.spoken}</span>
            </button>
          )
        })}
      </div>
      {body}
    </section>
  )
}

/**
 * The block of the chart (UX-38): from edge to edge of the screen, without
 * the sides of a card, on surface (the contrasts of the band were measured
 * on it); it grows to the bottom of the page (UX-37).
 */
const panel =
  '-mx-4 flex flex-1 flex-col border-y border-line bg-surface pt-1 pb-3'

type EmptyChartProps = { text: string; hint: string }

/**
 * Without readings (UX-36): what happens and what to do, inside the panel
 * of the chart and as high as it, so the screen keeps its shape.
 */
function EmptyChart({ text, hint }: EmptyChartProps) {
  return (
    <div
      className={`${panel} min-h-86 items-center justify-center gap-2 px-4 text-center`}
    >
      <p className="text-base text-ink">{text}</p>
      <p className="text-sm text-balance text-ink-soft">{hint}</p>
    </div>
  )
}
