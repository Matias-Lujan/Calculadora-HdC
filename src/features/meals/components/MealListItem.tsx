import { Link } from 'react-router'
import { formatEatenAt } from '../eatenAt.ts'
import { mealSummaryText } from '../history.ts'
import type { MealSummary } from '../types.ts'

type Props = {
  meal: MealSummary
}

/**
 * A meal in the history list: its date and time, carbs and doses. The state
 * tells the detail it was opened from the list (isFromHistoryList).
 */
export function MealListItem({ meal }: Props) {
  return (
    <Link
      to={`/history/${meal.id}`}
      state={{ fromHistory: true }}
      className="flex min-h-11 w-full flex-col justify-center gap-0.5 py-2"
    >
      <span className="font-medium">{formatEatenAt(meal.eaten_at)}</span>
      <span className="text-sm text-slate-700">{mealSummaryText(meal)}</span>
    </Link>
  )
}
