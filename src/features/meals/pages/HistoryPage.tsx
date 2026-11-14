import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { MealListItem } from '../components/MealListItem.tsx'
import { useMealList } from '../queries.ts'

/** The history (`/history`, spec §6.7): saved meals, most recent first. */
export function HistoryPage() {
  const list = useMealList()
  const meals = list.data?.pages.flatMap((page) => page.meals)

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Historial</h1>

      {/* With data, the list stays even if a later refetch fails. */}
      {meals !== undefined ? (
        meals.length === 0 ? (
          <p className="text-slate-700">Todavía no registraste comidas.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-slate-200">
              {meals.map((meal) => (
                <li key={meal.id}>
                  <MealListItem meal={meal} />
                </li>
              ))}
            </ul>
            {list.hasNextPage && (
              <div className="flex flex-col gap-3">
                {/* Disabled while any read is running: a page asked for
                    during a refetch would use an offset about to change. */}
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-slate-300 px-4 text-base disabled:opacity-60"
                  disabled={list.isFetching}
                  onClick={() => {
                    if (!list.isFetching) void list.fetchNextPage()
                  }}
                >
                  {list.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
                </button>
                {/* The retry is "Ver más" again. */}
                {list.isFetchNextPageError && (
                  <p role="alert" className="text-red-700">
                    {LOAD_ERROR_MESSAGE}
                  </p>
                )}
              </div>
            )}
          </>
        )
      ) : list.isError ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-red-700">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            className="min-h-11 self-start rounded-lg border border-slate-300 px-4 text-base disabled:opacity-60"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
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
