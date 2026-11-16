import { Link } from 'react-router'
import { formatEatenTime } from '../eatenAt.ts'
import { mealFoodsText, mealSummaryText } from '../history.ts'
import type { ListedMeal } from '../types.ts'

type Props = {
  meal: ListedMeal
}

/**
 * A meal in a day of the history list: its time, the names of its foods and
 * its carbs and doses. The state tells the detail it was opened from the
 * list (isFromHistoryList).
 */
export function MealListItem({ meal }: Props) {
  return (
    <Link
      to={`/history/${meal.id}`}
      state={{ fromHistory: true }}
      className="flex min-h-11 w-full flex-col justify-center gap-0.5 py-2"
    >
      <span className="flex min-w-0 gap-2">
        <span className="shrink-0 font-medium">
          {formatEatenTime(meal.eaten_at)}
        </span>
        {/* Many foods: at most two lines, cut with "…". */}
        <span className="line-clamp-2 min-w-0 break-words">
          {mealFoodsText(meal)}
        </span>
      </span>
      <span className="text-sm text-slate-700">{mealSummaryText(meal)}</span>
    </Link>
  )
}
