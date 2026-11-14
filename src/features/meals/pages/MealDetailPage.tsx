import { useRef } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
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
        className="flex min-h-11 items-center self-start text-slate-700"
      >
        ← Historial
      </Link>

      {meal.data === null ? (
        <div className="flex flex-col gap-3">
          <p>No encontramos esta comida.</p>
          <Link
            to="/history"
            className="flex min-h-11 items-center self-start rounded-lg border border-slate-300 px-4 text-base"
          >
            Ir al historial
          </Link>
        </div>
      ) : meal.data !== undefined ? (
        <MealDetail meal={meal.data} />
      ) : meal.isError ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-red-700">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            className="min-h-11 self-start rounded-lg border border-slate-300 px-4 text-base disabled:opacity-60"
            disabled={meal.isFetching}
            onClick={() => void meal.refetch()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <p className="text-slate-500">Cargando…</p>
      )}
    </section>
  )
}
