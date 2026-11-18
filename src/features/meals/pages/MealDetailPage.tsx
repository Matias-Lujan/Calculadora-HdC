import { ChevronLeft } from 'lucide-react'
import { useRef } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { LoadingShapes } from '../../../components/LoadingShapes.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { backLink, button } from '../../../components/styles.ts'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { MealDetail } from '../components/MealDetail.tsx'
import { isFromHistoryList, isPlainLeftClick } from '../history.ts'
import { useMeal } from '../queries.ts'

/** A saved meal (`/history/:mealId`, spec §6.7). */
export function MealDetailPage() {
  const { mealId = '' } = useParams()
  const meal = useMeal(mealId)
  const navigate = useNavigate()
  const state: unknown = useLocation().state
  const fromList = isFromHistoryList(state)
  // React-router applies the POP inside startTransition: until the list is
  // drawn, this page stays mounted with fromList, and a second tap would go
  // back two entries (to another tab of the app, or out of the site).
  const wentBack = useRef(false)

  return (
    <section className="flex flex-col gap-4">
      {/* Opened from the list, "← Historial" goes back in the browser
          history, so ScrollRestoration puts the list where it was (the
          installed app has no back button). Otherwise (from "Ver en el
          historial", a typed URL or a reopened app), or with a modifier key
          or another button (a new tab), the link acts as usual and opens the
          list at the top. */}
      <Link
        to="/history"
        onClick={(event) => {
          if (!fromList || !isPlainLeftClick(event)) return
          event.preventDefault()
          if (wentBack.current) return
          wentBack.current = true
          void navigate(-1)
        }}
        className={backLink}
      >
        <ChevronLeft aria-hidden="true" className="shrink-0" />
        Historial
      </Link>

      {meal.data === null ? (
        <div className="flex flex-col gap-3">
          <p>No encontramos esta comida.</p>
          <Link to="/history" className={`${button.secondary} self-start`}>
            Ir al historial
          </Link>
        </div>
      ) : meal.data !== undefined ? (
        <MealDetail meal={meal.data} />
      ) : meal.isError ? (
        <div className="flex flex-col gap-3">
          <Notice tone="error" role="alert">
            <p>{LOAD_ERROR_MESSAGE}</p>
          </Notice>
          <button
            type="button"
            className={`${button.secondary} self-start`}
            disabled={meal.isFetching}
            onClick={() => void meal.refetch()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        // The summary and the foods of the meal.
        <LoadingShapes shapes={['h-9 w-2/3', 'h-28', 'h-20', 'h-20']} />
      )}
    </section>
  )
}
