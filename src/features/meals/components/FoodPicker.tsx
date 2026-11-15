import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import { needsCookingFactor } from '../../../domain/dose/index.ts'
import type { Food } from '../../../lib/foods.ts'
import { pickerResults } from '../tableFoods.ts'
import type { MealFood } from '../types.ts'

type Props = {
  /** Active foods (the catalog list, without archived ones). */
  foods: Food[]
  /** The reference table foods, not copied yet (spec §6.2). */
  tableFoods: MealFood[]
  onPick: (food: MealFood) => void
}

/**
 * Search box to add a food to the meal, with the same search as the catalog
 * (spec §6.5), over the user's foods and the reference table (spec §6.6,
 * §14 #51). Results are shown only while the search has text. A food eaten
 * cooked without a factor is listed but cannot be picked (spec §6.4).
 */
export function FoodPicker({ foods, tableFoods, onPick }: Props) {
  const [query, setQuery] = useState('')
  const hasQuery = query.trim() !== ''
  const results = useMemo(
    () => pickerResults(foods, tableFoods, query),
    [foods, tableFoods, query],
  )
  const noResults = results.catalog.length === 0 && results.table.length === 0

  function pick(food: MealFood) {
    setQuery('')
    onPick(food)
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
          Buscá por nombre o marca, por ejemplo «banana» o «arroz».
        </p>
      </div>

      {hasQuery &&
        (noResults ? (
          <p className="text-slate-700">
            {`No hay alimentos que coincidan con "${query.trim()}".`}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {results.catalog.length > 0 && (
              <ResultGroup title="Tus alimentos">
                {results.catalog.map((food) => (
                  <li key={food.id}>
                    {needsCookingFactor(food.state, food.cooking_factor) ? (
                      <div className="flex flex-col items-start gap-1 py-2">
                        <FoodName food={food} />
                        <MissingFactorBadge />
                        <span className="text-sm text-slate-700">
                          Para usarlo en una comida, cargá cuánto rinde al
                          cocinarlo.
                        </span>
                        <Link
                          to={`/foods/${food.id}/edit`}
                          className="flex min-h-11 items-center text-base font-medium underline"
                        >
                          Cargar cuánto rinde
                        </Link>
                      </div>
                    ) : (
                      <PickButton food={food} onPick={pick} />
                    )}
                  </li>
                ))}
              </ResultGroup>
            )}
            {results.table.length > 0 && (
              <ResultGroup title="Tabla de alimentos">
                {results.table.map((food) => (
                  <li key={`table-${food.reference_code ?? food.name}`}>
                    <PickButton food={food} onPick={pick} />
                  </li>
                ))}
              </ResultGroup>
            )}
          </div>
        ))}
    </div>
  )
}

function ResultGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col">
      <h2 className="text-sm font-medium text-slate-500">{title}</h2>
      <ul className="flex flex-col divide-y divide-slate-200">{children}</ul>
    </section>
  )
}

function PickButton({
  food,
  onPick,
}: {
  food: MealFood
  onPick: (food: MealFood) => void
}) {
  return (
    <button
      type="button"
      className="flex min-h-11 w-full flex-col items-start justify-center py-2 text-left"
      onClick={() => onPick(food)}
    >
      <FoodName food={food} />
    </button>
  )
}

function FoodName({ food }: { food: Pick<MealFood, 'name' | 'brand'> }) {
  return (
    <>
      <span className="font-medium">{food.name}</span>
      {food.brand !== null && (
        <span className="text-sm text-slate-500">{food.brand}</span>
      )}
    </>
  )
}
