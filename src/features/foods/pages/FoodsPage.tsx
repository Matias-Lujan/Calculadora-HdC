import { Plus, Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { DisclosureIcon } from '../../../components/DisclosureIcon.tsx'
import { LoadingShapes } from '../../../components/LoadingShapes.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { PhotoPickerButton } from '../../../components/PhotoPickerButton.tsx'
import {
  button,
  disclosure,
  field,
  fieldLabel,
  pageTitle,
} from '../../../components/styles.ts'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { useFoods, type Food } from '../../../lib/foods.ts'
import { holdLabelPhoto } from '../../../lib/labelPhotoHandoff.ts'
import { searchFoods } from '../../../lib/search.ts'
import { FoodListItem } from '../components/FoodListItem.tsx'

/**
 * "Mis alimentos" (`/foods`, spec §6.5): the search shows results only with
 * text, and the whole list is folded under "Ver todos los alimentos".
 */
export function FoodsPage() {
  const foods = useFoods()
  const navigate = useNavigate()
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
        <h1 className={pageTitle}>Mis alimentos</h1>
        <p>
          Los alimentos que guardaste. Buscá uno para ver sus datos, editarlo o
          archivarlo.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {/* Opens the camera or the gallery in the same tap (UX-16); the
            photo screen starts with the photo picked. */}
        <div className="flex flex-col gap-1">
          <PhotoPickerButton
            label="Agregar con una foto"
            onFile={(file) =>
              void navigate('/foods/label', { state: holdLabelPhoto(file) })
            }
          />
          <p className="text-sm text-ink-soft">
            Sacale una foto a la tabla nutricional del paquete; si entra,
            también al nombre.
          </p>
        </div>
        <Link to="/foods/new" className={button.soft}>
          <Plus aria-hidden="true" />
          Agregar a mano
        </Link>
      </div>

      {/* With data, the list stays even if a later refetch fails. */}
      {foods.data !== undefined ? (
        foods.data.length === 0 ? (
          <p>
            Todavía no guardaste alimentos. Sacale una foto a una etiqueta para
            empezar.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="food-search" className={fieldLabel}>
                Buscar en mis alimentos
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft"
                />
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
                  className={`${field} pl-10`}
                />
              </div>
            </div>
            {/* While searching, only the results; the whole list comes back
                (open or folded, as it was) when the search is emptied. */}
            {searching ? (
              results.length === 0 ? (
                <p>{`No hay alimentos que coincidan con «${query.trim()}».`}</p>
              ) : (
                <FoodList foods={results} />
              )
            ) : (
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={showAll}
                  aria-controls={allId}
                  className={`${disclosure} self-start`}
                  onClick={() => setShowAll((current) => !current)}
                >
                  <DisclosureIcon open={showAll} />
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
          <Notice tone="error" role="alert">
            <p>{LOAD_ERROR_MESSAGE}</p>
          </Notice>
          <button
            type="button"
            className={`${button.secondary} self-start`}
            disabled={foods.isFetching}
            onClick={() => void foods.refetch()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        // The search and «Ver todos los alimentos».
        <LoadingShapes shapes={['h-16', 'h-11 w-64']} />
      )}
    </section>
  )
}

function FoodList({ foods }: { foods: Food[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {foods.map((food) => (
        <li key={food.id}>
          <FoodListItem food={food} />
        </li>
      ))}
    </ul>
  )
}
