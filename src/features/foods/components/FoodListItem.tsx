import { Link } from 'react-router'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import { needsCookingFactor } from '../../../domain/dose/index.ts'
import type { Food } from '../../../lib/foods.ts'

type Props = {
  food: Food
}

export function FoodListItem({ food }: Props) {
  return (
    <Link
      to={`/foods/${food.id}`}
      className="flex min-h-11 w-full flex-col justify-center gap-0.5 py-2"
    >
      <span className="font-medium">{food.name}</span>
      {food.brand !== null && (
        <span className="text-sm text-slate-500">{food.brand}</span>
      )}
      {needsCookingFactor(food.state, food.cooking_factor) && (
        <span>
          <MissingFactorBadge />
        </span>
      )}
    </Link>
  )
}
