import { useMemo, useState } from 'react'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { FoodListItem } from '../components/FoodListItem.tsx'
import { useFoods } from '../queries.ts'
import { searchFoods } from '../search.ts'

export function FoodsPage() {
  const foods = useFoods()
  const [query, setQuery] = useState('')
  const results = useMemo(
    () => (foods.data === undefined ? [] : searchFoods(foods.data, query)),
    [foods.data, query],
  )

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Catálogo</h1>

      {/* "Agregar alimento" (feature 3) goes here. */}

      {/* With data, the list stays even if a later refetch fails. */}
      {foods.data !== undefined ? (
        foods.data.length === 0 ? (
          <p className="text-slate-700">Todavía no cargaste alimentos.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="food-search" className="text-sm text-slate-700">
                Buscar por nombre o marca
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
            {results.length === 0 ? (
              <p className="text-slate-700">
                {`No hay alimentos que coincidan con "${query.trim()}".`}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-200">
                {results.map((food) => (
                  <li key={food.id}>
                    <FoodListItem food={food} />
                  </li>
                ))}
              </ul>
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
