import { Link } from 'react-router'
import { formatEatenTime } from '../eatenAt.ts'
import {
  appliedDoseParts,
  mealFoodsText,
  mealRowDetailText,
  mealRowLabel,
} from '../history.ts'
import type { ListedMeal } from '../types.ts'

type Props = {
  meal: ListedMeal
}

/**
 * A meal in a day of the history list (UX-11), in three columns: the time;
 * the names of its foods and, under them, its carbs and the calculated dose;
 * and the applied dose, big, at the right ("—" without one). VoiceOver reads
 * the whole row at once (mealRowLabel). The state tells the detail it was
 * opened from the list (isFromHistoryList).
 */
export function MealListItem({ meal }: Props) {
  const applied = appliedDoseParts(meal.applied_dose_units)
  return (
    <Link
      to={`/history/${meal.id}`}
      state={{ fromHistory: true }}
      aria-label={mealRowLabel(meal)}
      className="flex min-h-14 w-full items-start gap-3 py-3"
    >
      <span className="shrink-0 font-semibold tabular-nums">
        {formatEatenTime(meal.eaten_at)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Many foods: at most two lines, cut with "…". */}
        <span className="line-clamp-2 break-words">{mealFoodsText(meal)}</span>
        <span className="text-sm text-ink-soft tabular-nums">
          {mealRowDetailText(meal)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="font-display text-xl leading-6 font-bold tabular-nums">
          {applied === null ? '—' : applied.number}
        </span>
        {applied !== null && (
          <span className="text-xs text-ink-soft">{applied.word}</span>
        )}
      </span>
    </Link>
  )
}
