import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Notice } from '../../../components/Notice.tsx'
import { button, pageTitle } from '../../../components/styles.ts'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { MealDayGroup } from '../components/MealDayGroup.tsx'
import { groupMealsByDay, openDaysFromState, toggledDays } from '../history.ts'
import { useMealList } from '../queries.ts'

/**
 * The history (`/history`, spec §6.7): saved meals, most recent first,
 * grouped by day, every day folded at first.
 */
export function HistoryPage() {
  const list = useMealList()
  const meals = list.data?.pages.flatMap((page) => page.meals)
  const days =
    meals === undefined ? undefined : groupMealsByDay(meals, list.hasNextPage)
  const location = useLocation()
  const navigate = useNavigate()
  // The open days live in the state of this entry of the browser history:
  // going back from a meal finds them open, so the scroll restored by
  // ScrollRestoration lands where it was. From the bar, none is open.
  const openDays = openDaysFromState(location.state)
  // "Hoy" and "Ayer" are relative to when the list was opened.
  const [now] = useState(() => new Date())

  function toggle(day: string) {
    void navigate(location.pathname, {
      replace: true,
      state: { openDays: toggledDays(openDays, day) },
      // A new entry would otherwise open at the top.
      preventScrollReset: true,
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className={pageTitle}>Historial</h1>

      {/* With data, the list stays even if a later refetch fails. */}
      {days !== undefined ? (
        days.length === 0 ? (
          <p>Todavía no registraste comidas.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {days.map((day) => (
                <li key={day.day}>
                  <MealDayGroup
                    day={day}
                    open={openDays.includes(day.day)}
                    onToggle={() => toggle(day.day)}
                    now={now}
                  />
                </li>
              ))}
            </ul>
            {list.hasNextPage && (
              <div className="flex flex-col gap-3">
                {/* Disabled while any read is running: a page asked for
                    during a refetch would use an offset about to change. */}
                <button
                  type="button"
                  className={button.secondary}
                  disabled={list.isFetching}
                  onClick={() => {
                    if (!list.isFetching) void list.fetchNextPage()
                  }}
                >
                  {list.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
                </button>
                {/* The retry is "Ver más" again. */}
                {list.isFetchNextPageError && (
                  <Notice tone="error" role="alert">
                    <p>{LOAD_ERROR_MESSAGE}</p>
                  </Notice>
                )}
              </div>
            )}
          </>
        )
      ) : list.isError ? (
        <div className="flex flex-col gap-3">
          <Notice tone="error" role="alert">
            <p>{LOAD_ERROR_MESSAGE}</p>
          </Notice>
          <button
            type="button"
            className={`${button.secondary} self-start`}
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <p className="text-ink-soft">Cargando…</p>
      )}
    </section>
  )
}
