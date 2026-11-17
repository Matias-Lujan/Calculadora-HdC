import { Plus, Search } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import { button, field, fieldLabel } from '../../../components/styles.ts'
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
  /** The meal has no items: the search is shown open, without the button. */
  alwaysOpen: boolean
}

/**
 * "Agregar alimento" (spec §6.6, §14 #53). With an empty meal the search box
 * is shown open; once the meal has items, a button unfolds it. It uses the same
 * search as the catalog (spec §6.5), over the user's foods and the reference table (spec §6.6, §14 #51). Results are shown only
 * while the search has text. A food eaten cooked without a factor is listed
 * but cannot be picked (spec §6.4). Picking a food folds and empties the
 * search; the same button folds it without picking.
 */
export function FoodPicker({ foods, tableFoods, onPick, alwaysOpen }: Props) {
  const [open, setOpen] = useState(false)
  const expanded = alwaysOpen || open
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const hasQuery = query.trim() !== ''
  const results = useMemo(
    () => pickerResults(foods, tableFoods, query),
    [foods, tableFoods, query],
  )
  const noResults = results.catalog.length === 0 && results.table.length === 0

  function toggle() {
    if (open) {
      setOpen(false)
      setQuery('')
      return
    }
    // The field has to be in the DOM before focusing it, and the focus has
    // to happen inside the tap: iOS only opens the keyboard that way (#44).
    flushSync(() => {
      setOpen(true)
    })
    inputRef.current?.focus()
  }

  // The parent's flushSync (to focus the new item) also applies these.
  function pick(food: MealFood) {
    setOpen(false)
    setQuery('')
    onPick(food)
  }

  return (
    <div className="flex flex-col gap-2">
      {!alwaysOpen && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="meal-food-picker"
          className={button.soft}
          onClick={toggle}
        >
          <Plus aria-hidden="true" />
          Agregar alimento
        </button>
      )}

      {expanded && (
        <div id="meal-food-picker" className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            {alwaysOpen ? (
              <label htmlFor="meal-food-search" className={fieldLabel}>
                Agregar alimento
              </label>
            ) : (
              <label htmlFor="meal-food-search" className="sr-only">
                Buscar alimento
              </label>
            )}
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft"
              />
              <input
                ref={inputRef}
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
                className={`${field} pl-10`}
              />
            </div>
            <p id="meal-food-search-help" className="text-sm text-ink-soft">
              Buscá por nombre o marca, por ejemplo «banana» o «arroz».
            </p>
          </div>

          {hasQuery &&
            (noResults ? (
              <p>{`No hay alimentos que coincidan con "${query.trim()}".`}</p>
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
                            <span className="text-sm text-ink">
                              Para usarlo en una comida, cargá cuánto rinde al
                              cocinarlo.
                            </span>
                            <Link
                              to={`/foods/${food.id}/edit`}
                              className={button.text}
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
      )}
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
      <h2 className="text-sm font-medium text-ink-soft">{title}</h2>
      <ul className="flex flex-col divide-y divide-line">{children}</ul>
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
      className="flex min-h-14 w-full flex-col items-start justify-center py-2 text-left"
      onClick={() => onPick(food)}
    >
      <FoodName food={food} />
    </button>
  )
}

function FoodName({ food }: { food: Pick<MealFood, 'name' | 'brand'> }) {
  return (
    <>
      <span className="font-semibold">{food.name}</span>
      {food.brand !== null && (
        <span className="text-sm text-ink-soft">{food.brand}</span>
      )}
    </>
  )
}
