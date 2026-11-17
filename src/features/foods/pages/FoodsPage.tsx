import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { useFoods, type Food } from '../../../lib/foods.ts'
import { searchFoods } from '../../../lib/search.ts'
import { FoodListItem } from '../components/FoodListItem.tsx'

/**
 * "Mis alimentos" (`/foods`, spec §6.5): the search shows results only with
 * text, and the whole list is folded under "Ver todos los alimentos".
 */
export function FoodsPage() {
  const foods = useFoods()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const allId = useId()
  const searching = query.trim() !== ''
  // searchFoods with an empty query gives every food, sorted.
  const results = useMemo(
    () => (foods.data === undefined ? [] : searchFoods(foods.data, query)),
    [foods.data, query],
  )

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Mis alimentos</h1>
        <p className="text-slate-700">
          Los alimentos que guardaste. Buscá uno para ver sus datos, editarlo o
          archivarlo.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Link
          to="/foods/label"
          className="flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-base font-medium text-white"
        >
          Agregar con una foto
        </Link>
        <Link
          to="/foods/new"
          className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-base"
        >
          Agregar a mano
        </Link>
      </div>

      {/* With data, the list stays even if a later refetch fails. */}
      {foods.data !== undefined ? (
        foods.data.length === 0 ? (
          <p className="text-slate-700">Todavía no cargaste alimentos.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="food-search" className="text-sm text-slate-700">
                Buscar en mis alimentos
              </label>
              <input
                id="food-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-base"
              />
            </div>
            {/* While searching, only the results; the whole list comes back
                (open or folded, as it was) when the search is emptied. */}
            {searching ? (
              results.length === 0 ? (
                <p className="text-slate-700">
                  {`No hay alimentos que coincidan con "${query.trim()}".`}
                </p>
              ) : (
                <FoodList foods={results} />
              )
            ) : (
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={showAll}
                  aria-controls={allId}
                  className="flex min-h-11 items-center gap-2 self-start font-medium text-slate-700"
                  onClick={() => setShowAll((current) => !current)}
                >
                  <span aria-hidden="true">{showAll ? '▾' : '▸'}</span>
                  {`Ver todos los alimentos (${foods.data.length})`}
                </button>
                {showAll && (
                  <div id={allId}>
                    <FoodList foods={results} />
                  </div>
                )}
              </div>
            )}
          </>
        )
      ) : foods.isError ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-red-700">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            className="min-h-11 self-start rounded-lg border border-slate-300 px-4 text-base disabled:opacity-60"
            disabled={foods.isFetching}
            onClick={() => void foods.refetch()}
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

function FoodList({ foods }: { foods: Food[] }) {
  return (
    <ul className="flex flex-col divide-y divide-slate-200">
      {foods.map((food) => (
        <li key={food.id}>
          <FoodListItem food={food} />
        </li>
      ))}
    </ul>
  )
}
