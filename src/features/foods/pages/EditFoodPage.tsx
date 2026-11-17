import { ChevronLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Notice } from '../../../components/Notice.tsx'
import { backLink, button } from '../../../components/styles.ts'
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
          <Link to="/foods" className={`${button.secondary} self-start`}>
            Ir a mis alimentos
          </Link>
        </div>
      ) : food.data !== undefined ? (
        <>
          <Link to={`/foods/${food.data.id}`} className={backLink}>
            <ChevronLeft aria-hidden="true" className="shrink-0" />
            {food.data.name}
          </Link>
          {/* With data, the form stays even if a later refetch fails, so
              what the user is editing is not lost. */}
          <FoodForm key={food.data.id} mode="edit" food={food.data} />
        </>
      ) : food.isError ? (
        <div className="flex flex-col gap-3">
          <Notice tone="error" role="alert">
            <p>{LOAD_ERROR_MESSAGE}</p>
          </Notice>
          <button
            type="button"
            className={`${button.secondary} self-start`}
            disabled={food.isFetching}
            onClick={() => void food.refetch()}
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
