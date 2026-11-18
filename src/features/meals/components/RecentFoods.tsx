import { useId } from 'react'
import { chip } from '../../../components/styles.ts'
import type { Food } from '../../../lib/foods.ts'

type Props = {
  foods: Food[]
  onPick: (food: Food) => void
}

/**
 * "Recientes" (spec §6.6, UX-08): a chip per food, to add it with one tap,
 * as if it were picked in the search. Nothing if there are none.
 */
export function RecentFoods({ foods, onPick }: Props) {
  const titleId = useId()
  if (foods.length === 0) return null
  return (
    <section className="flex flex-col gap-2" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-sm font-medium text-ink-soft">
        Recientes
      </h2>
      <ul className="flex flex-wrap gap-2">
        {foods.map((food) => (
          <li key={food.id} className="max-w-full">
            <button
              type="button"
              className={`${chip} max-w-full`}
              onClick={() => onPick(food)}
            >
              <span className="truncate">{food.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
