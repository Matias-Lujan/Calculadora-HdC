import { LoadingShapes } from '../../../components/LoadingShapes.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { button, pageTitle } from '../../../components/styles.ts'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { useFoods } from '../../../lib/foods.ts'
import { useSettings } from '../../../lib/settings.ts'
import { GlucoseCard } from '../components/GlucoseCard.tsx'
import { EMPTY_MEAL_TITLE, MealForm } from '../components/MealForm.tsx'
import {
  useGlucoseDay,
  useLatestGlucose,
  useRecentMeals,
  useReferenceFoods,
} from '../queries.ts'

/** Home ("Inicio", `/`): a new meal (spec §6.6). */
export function NewMealPage() {
  const foods = useFoods()
  const referenceFoods = useReferenceFoods()
  const settings = useSettings()
  // Only for the shortcuts of an empty Inicio: Inicio does not wait for it,
  // and without it (loading or failed) they are not shown.
  const recentMeals = useRecentMeals()
  // Only a reference, apart from the meal (spec §6.9): it never goes into
  // the calculation, and Inicio does not wait for it.
  const glucose = useLatestGlucose()
  // The small curve of the box (UX-35): the same saved readings as the
  // chart, every 5 minutes. Inicio does not wait for them either.
  const glucoseDay = useGlucoseDay()
  const queries = [foods, referenceFoods, settings]

  // A query fails "without data" only if it never loaded. With data, a later
  // refetch that fails keeps what it had, so the meal being entered is not
  // lost (like FoodsPage).
  const failed = queries.filter(
    (query) => query.data === undefined && query.isError,
  )

  const glucoseCard = (
    <GlucoseCard
      reading={glucose.data}
      error={glucose.error}
      isPending={glucose.isPending}
      readings={glucoseDay.data}
    />
  )

  return (
    <section className="flex flex-col gap-4">
      {/* With the meal loaded, MealForm writes the title ("Corregir comida"
          while correcting) and shows the glucose only without foods. */}
      {foods.data !== undefined &&
      referenceFoods.data !== undefined &&
      settings.data !== undefined ? (
        <MealForm
          foods={foods.data}
          referenceFoods={referenceFoods.data}
          settings={settings.data}
          recentMeals={recentMeals.data}
          glucose={glucoseCard}
        />
      ) : failed.length > 0 ? (
        <>
          {glucoseCard}
          <div className="flex flex-col gap-3">
            <h1 className={pageTitle}>{EMPTY_MEAL_TITLE}</h1>
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
        </>
      ) : (
        <>
          {glucoseCard}
          <h1 className={pageTitle}>{EMPTY_MEAL_TITLE}</h1>
          {/* The search field and the shortcuts of an empty Inicio. */}
          <LoadingShapes shapes={['h-12', 'h-24', 'h-24']} />
        </>
      )}
    </section>
  )
}
