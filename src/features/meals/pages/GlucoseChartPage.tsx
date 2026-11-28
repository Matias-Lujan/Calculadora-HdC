import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { LoadingShapes } from '../../../components/LoadingShapes.tsx'
import { Notice } from '../../../components/Notice.tsx'
import {
  backLink,
  button,
  card,
  pageTitle,
} from '../../../components/styles.ts'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { GlucoseChart } from '../components/GlucoseChart.tsx'
import {
  GLUCOSE_CHART_EMPTY_TEXT,
  GLUCOSE_CHART_INFO,
  GLUCOSE_CHART_TITLE,
} from '../glucose.ts'
import { chartPoints, withLatest } from '../glucoseChart.ts'
import { useGlucoseDay, useLatestGlucose, useMealMarks } from '../queries.ts'
import { useNow } from '../useNow.ts'

/**
 * The glucose of the last 24 hours (`/glucose`, spec §6.10), opened from
 * the box of Inicio. Only a reference: it never goes into the calculation
 * (CLAUDE.md, rule 7). The saved readings, plus the live one of Inicio when
 * it is newer, and a mark for each meal saved in those hours.
 */
export function GlucoseChartPage() {
  const day = useGlucoseDay()
  const marks = useMealMarks()
  const latest = useLatestGlucose()
  const now = useNow()

  // With data, the chart stays even if a later refetch fails.
  const queries = [day, marks]
  const failed = queries.filter(
    (query) => query.data === undefined && query.isError,
  )

  let body
  if (day.data !== undefined && marks.data !== undefined) {
    const readings = withLatest(day.data, latest.data, now)
    body =
      chartPoints(readings, now).length === 0 ? (
        <p>{GLUCOSE_CHART_EMPTY_TEXT}</p>
      ) : (
        <div className={card}>
          <GlucoseChart readings={readings} mealTimes={marks.data} now={now} />
        </div>
      )
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
    // The chart, in its card.
    body = <LoadingShapes shapes={['h-56']} />
  }

  return (
    <section className="flex flex-col gap-4">
      <Link to="/" className={backLink}>
        <ChevronLeft aria-hidden="true" className="shrink-0" />
        Inicio
      </Link>
      <div className="flex flex-wrap items-center gap-x-2">
        <h1 className={pageTitle}>{GLUCOSE_CHART_TITLE}</h1>
        <InfoTip text={GLUCOSE_CHART_INFO} />
      </div>
      {body}
    </section>
  )
}
