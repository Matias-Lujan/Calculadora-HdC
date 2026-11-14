import { Link } from 'react-router'
import { needsCookingFactor, type Food } from '../types.ts'
import { MissingFactorBadge } from './MissingFactorBadge.tsx'

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
      {needsCookingFactor(food) && (
        <span>
          <MissingFactorBadge />
        </span>
      )}
    </Link>
  )
}
