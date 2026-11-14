import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import { needsCookingFactor } from '../../../domain/dose/index.ts'
import type { Food } from '../../../lib/foods.ts'
import { searchFoods } from '../../../lib/search.ts'

type Props = {
  /** Active foods (the catalog list, without archived ones). */
  foods: Food[]
  onPick: (food: Food) => void
}

/**
 * Search box to add a food to the meal, with the same search as the catalog
 * (spec §6.5). Results are shown only while the search has text. A food
 * eaten cooked without a factor is listed but cannot be picked (spec §6.4).
 */
export function FoodPicker({ foods, onPick }: Props) {
  const [query, setQuery] = useState('')
  const hasQuery = query.trim() !== ''
  const results = useMemo(
    () => (hasQuery ? searchFoods(foods, query) : []),
    [foods, query, hasQuery],
  )

  if (foods.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-slate-700">Todavía no cargaste alimentos.</p>
        <Link
          to="/foods/new"
          className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-base font-medium"
        >
          Agregar alimento
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="meal-food-search"
          className="text-sm font-medium text-slate-700"
        >
          Agregar alimento
        </label>
        <input
          id="meal-food-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="meal-food-search-help"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-base"
        />
        <p id="meal-food-search-help" className="text-sm text-slate-500">
          Buscá por nombre o marca.
        </p>
      </div>

      {hasQuery &&
        (results.length === 0 ? (
          <p className="text-slate-700">
            {`No hay alimentos que coincidan con "${query.trim()}".`}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200">
            {results.map((food) => (
              <li key={food.id}>
                {needsCookingFactor(food.state, food.cooking_factor) ? (
                  <div className="flex flex-col items-start gap-1 py-2">
                    <FoodName food={food} />
                    <MissingFactorBadge />
                    <span className="text-sm text-slate-700">
                      Cargá el factor en el catálogo para usar este alimento.
                    </span>
                    <Link
                      to={`/foods/${food.id}/edit`}
                      className="flex min-h-11 items-center text-base font-medium underline"
                    >
                      Cargar el factor
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex min-h-11 w-full flex-col items-start justify-center py-2 text-left"
                    onClick={() => {
                      setQuery('')
                      onPick(food)
                    }}
                  >
                    <FoodName food={food} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}

function FoodName({ food }: { food: Food }) {
  return (
    <>
      <span className="font-medium">{food.name}</span>
      {food.brand !== null && (
        <span className="text-sm text-slate-500">{food.brand}</span>
      )}
    </>
  )
}
