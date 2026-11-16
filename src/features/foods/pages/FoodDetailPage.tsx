import { Link, useParams } from 'react-router'
import { LOAD_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { FoodDetail } from '../components/FoodDetail.tsx'
import { useFood } from '../queries.ts'

export function FoodDetailPage() {
  const { foodId = '' } = useParams()
  const food = useFood(foodId)

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/foods"
        className="flex min-h-11 items-center self-start text-slate-700"
      >
        ← Mis alimentos
      </Link>

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
        <FoodDetail food={food.data} />
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
