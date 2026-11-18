import { PencilLine, Search, X } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import { PhotoPickerButton } from '../../../components/PhotoPickerButton.tsx'
import { button, field } from '../../../components/styles.ts'
import { needsCookingFactor } from '../../../domain/dose/index.ts'
import type { Food } from '../../../lib/foods.ts'
import { holdLabelPhoto } from '../../../lib/labelPhotoHandoff.ts'
import { fromMealState } from '../../../lib/mealHandoff.ts'
import { pickerResults } from '../tableFoods.ts'
import type { MealFood } from '../types.ts'
import { RecentFoods } from './RecentFoods.tsx'

/** The search field: who opens the search gives it the focus in the tap. */
export const FOOD_SEARCH_INPUT_ID = 'meal-food-search'

type Props = {
  /** Active foods (the catalog list, without archived ones). */
  foods: Food[]
  /** The reference table foods, not copied yet (spec §6.2). */
  tableFoods: MealFood[]
  /** "Recientes", shown while nothing is written. */
  recents: Food[]
  onPick: (food: MealFood) => void
  /** ✕ or Escape: closes without picking. */
  onClose: () => void
}

/**
 * "Agregar alimento" (spec §6.6, UX-08): a panel over the whole screen
 * (also over the dose display and the bar), with the field on top, a ✕ to
 * close and, below, all the height for the results. While nothing is
 * written, the help and "Recientes". It uses the same search as the catalog
 * (spec §6.5), over the user's foods and the reference table (#51). A food
 * eaten cooked without how much it yields is listed but cannot be picked
 * (spec §6.4). Without matches, it offers adding the food with a photo or by
 * hand; both come back to Inicio with the food added (src/lib/mealHandoff.ts).
 * The photo one opens the camera or the gallery in the same tap (UX-16).
 * Both replace the entry of the open search in the browser history, so
 * going back from them lands on Inicio.
 */
export function FoodSearchSheet({
  foods,
  tableFoods,
  recents,
  onPick,
  onClose,
}: Props) {
  const titleId = useId()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const results = useMemo(
    () => pickerResults(foods, tableFoods, query),
    [foods, tableFoods, query],
  )
  const noResults = results.catalog.length === 0 && results.table.length === 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-paper pt-[env(safe-area-inset-top)]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <h2 id={titleId} className="sr-only">
        Agregar alimento
      </h2>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-3">
          <label htmlFor={FOOD_SEARCH_INPUT_ID} className="sr-only">
            Buscar alimento
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft"
            />
            <input
              id={FOOD_SEARCH_INPUT_ID}
              type="search"
              placeholder="Buscar alimento"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={`${FOOD_SEARCH_INPUT_ID}-help`}
              className={`${field} pl-10`}
            />
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <p
            id={`${FOOD_SEARCH_INPUT_ID}-help`}
            className={trimmed === '' ? 'text-sm text-ink-soft' : 'sr-only'}
          >
            Buscá por nombre o marca
          </p>

          {trimmed === '' ? (
            <RecentFoods foods={recents} onPick={onPick} />
          ) : noResults ? (
            <div className="flex flex-col gap-3">
              <p role="status">{`No hay alimentos que coincidan con «${trimmed}».`}</p>
              <PhotoPickerButton
                label="Agregar con una foto"
                variant="secondary"
                onFile={(file) =>
                  void navigate('/foods/label', {
                    replace: true,
                    state: { ...fromMealState(), ...holdLabelPhoto(file) },
                  })
                }
              />
              <Link
                to="/foods/new"
                replace
                state={fromMealState(trimmed)}
                className={button.secondary}
              >
                <PencilLine aria-hidden="true" className="shrink-0" />
                Agregar a mano
              </Link>
            </div>
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
                            replace
                            className={button.text}
                          >
                            Cargar cuánto rinde
                          </Link>
                        </div>
                      ) : (
                        <PickButton food={food} onPick={onPick} />
                      )}
                    </li>
                  ))}
                </ResultGroup>
              )}
              {results.table.length > 0 && (
                <ResultGroup title="Tabla de alimentos">
                  {results.table.map((food) => (
                    <li key={`table-${food.reference_code ?? food.name}`}>
                      <PickButton food={food} onPick={onPick} />
                    </li>
                  ))}
                </ResultGroup>
              )}
            </div>
          )}
        </div>
      </div>
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
      <h3 className="text-sm font-medium text-ink-soft">{title}</h3>
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
