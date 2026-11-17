import { ChevronRight } from 'lucide-react'
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
      className="flex min-h-14 w-full items-center gap-3 py-2"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 gap-2">
          <span className="shrink-0 font-semibold tabular-nums">
            {formatEatenTime(meal.eaten_at)}
          </span>
          {/* Many foods: at most two lines, cut with "…". */}
          <span className="line-clamp-2 min-w-0 break-words">
            {mealFoodsText(meal)}
          </span>
        </span>
        <span className="text-sm text-ink-soft tabular-nums">
          {mealSummaryText(meal)}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="shrink-0 text-ink-soft" />
    </Link>
  )
}
