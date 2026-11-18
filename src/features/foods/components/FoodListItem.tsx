import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import { needsCookingFactor } from '../../../domain/dose/index.ts'
import type { Food } from '../../../lib/foods.ts'
import { foodKeyFigure } from '../foodDetail.ts'

type Props = {
  food: Food
}

/**
 * A row of Mis alimentos: the name, the brand, the carbs in small (to check
 * a value without opening it, UX-26) and the arrow to its detail.
 */
export function FoodListItem({ food }: Props) {
  const { amount, rest } = foodKeyFigure(food)
  return (
    <Link
      to={`/foods/${food.id}`}
      className="flex min-h-14 w-full items-center gap-3 py-2"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{food.name}</span>
        {food.brand !== null && (
          <span className="text-sm text-ink-soft">{food.brand}</span>
        )}
        <span className="text-sm text-ink-soft tabular-nums">
          {`${amount} ${rest}`}
        </span>
        {needsCookingFactor(food.state, food.cooking_factor) && (
          <span>
            <MissingFactorBadge />
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="shrink-0 text-ink-soft" />
    </Link>
  )
}
