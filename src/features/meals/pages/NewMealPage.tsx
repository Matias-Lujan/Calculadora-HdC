import { Notice } from '../../../components/Notice.tsx'
import { button, pageTitle } from '../../../components/styles.ts'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { useFoods } from '../../../lib/foods.ts'
import { useSettings } from '../../../lib/settings.ts'
import { MealForm } from '../components/MealForm.tsx'
import { useReferenceFoods } from '../queries.ts'

/** Home ("Inicio", `/`): a new meal (spec §6.6). */
export function NewMealPage() {
  const foods = useFoods()
  const referenceFoods = useReferenceFoods()
  const settings = useSettings()
  const queries = [foods, referenceFoods, settings]

  // A query fails "without data" only if it never loaded. With data, a later
  // refetch that fails keeps what it had, so the meal being entered is not
  // lost (like FoodsPage).
  const failed = queries.filter(
    (query) => query.data === undefined && query.isError,
  )

  return (
    <section className="flex flex-col gap-4">
      <h1 className={pageTitle}>Nueva comida</h1>

      {foods.data !== undefined &&
      referenceFoods.data !== undefined &&
      settings.data !== undefined ? (
        <MealForm
          foods={foods.data}
          referenceFoods={referenceFoods.data}
          settings={settings.data}
        />
      ) : failed.length > 0 ? (
        <div className="flex flex-col gap-3">
          <Notice tone="error" role="alert">
            <p>{LOAD_ERROR_MESSAGE}</p>
          </Notice>
          <button
            type="button"
            className={`${button.secondary} self-start`}
            disabled={queries.some((query) => query.isFetching)}
            onClick={() => {
              for (const query of failed) void query.refetch()
            }}
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
