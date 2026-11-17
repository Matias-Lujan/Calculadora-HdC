import { Link, useParams } from 'react-router'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { FoodForm } from '../components/FoodForm.tsx'
import { useFood } from '../queries.ts'

export function EditFoodPage() {
  const { foodId = '' } = useParams()
  const food = useFood(foodId)

  return (
    <section className="flex flex-col gap-4">
      {food.data === null ? (
        <div className="flex flex-col gap-3">
          <p>No encontramos este alimento.</p>
          <Link
            to="/foods"
            className="flex min-h-11 items-center self-start rounded-lg border border-slate-300 px-4 text-base"
          >
            Ir a mis alimentos
          </Link>
        </div>
      ) : food.data !== undefined ? (
        <>
          <Link
            to={`/foods/${food.data.id}`}
            className="flex min-h-11 items-center self-start text-slate-700"
          >
            {`← ${food.data.name}`}
          </Link>
          {/* With data, the form stays even if a later refetch fails, so
              what the user is editing is not lost. */}
          <FoodForm key={food.data.id} mode="edit" food={food.data} />
        </>
      ) : food.isError ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-red-700">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            className="min-h-11 self-start rounded-lg border border-slate-300 px-4 text-base disabled:opacity-60"
            disabled={food.isFetching}
            onClick={() => void food.refetch()}
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
