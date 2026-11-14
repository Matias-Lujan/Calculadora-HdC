import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { useFoods } from '../../../lib/foods.ts'
import { useSettings } from '../../../lib/settings.ts'
import { MealForm } from '../components/MealForm.tsx'

/** Home ("Inicio", `/`): a new meal (spec §6.6). */
export function NewMealPage() {
  const foods = useFoods()
  const settings = useSettings()

  // A query fails "without data" only if it never loaded. With data, a later
  // refetch that fails keeps what it had, so the meal being entered is not
  // lost (like FoodsPage).
  const foodsFailed = foods.data === undefined && foods.isError
  const settingsFailed = settings.data === undefined && settings.isError

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nueva comida</h1>

      {foods.data !== undefined && settings.data !== undefined ? (
        <MealForm foods={foods.data} settings={settings.data} />
      ) : foodsFailed || settingsFailed ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-red-700">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            className="min-h-11 self-start rounded-lg border border-slate-300 px-4 text-base disabled:opacity-60"
            disabled={foods.isFetching || settings.isFetching}
            onClick={() => {
              if (foodsFailed) void foods.refetch()
              if (settingsFailed) void settings.refetch()
            }}
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
