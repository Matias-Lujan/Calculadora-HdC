import { useId } from 'react'
import { button, card } from '../../../components/styles.ts'
import { formatCarbs } from '../../../domain/dose/index.ts'
import { formatMealMoment, ofMealMoment } from '../eatenAt.ts'
import { mealFoodsText } from '../history.ts'
import type { SuggestedMeals } from '../recentMeals.ts'
import type { RecentMeal } from '../types.ts'

type Props = {
  suggestions: SuggestedMeals
  now: Date
  onRepeat: (meal: RecentMeal) => void
}

/**
 * "A esta hora comiste" or "Tus últimas comidas" (spec §6.6, UX-09): a row
 * per meal, "Ayer 08:30 · Yogur, Pan lactal · 45,5 g de HC", with the carbs
 * and names as they were saved, and "Repetir".
 */
export function MealSuggestions({ suggestions, now, onRepeat }: Props) {
  const titleId = useId()
  return (
    <section className="flex flex-col gap-2" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-sm font-medium text-ink-soft">
        {suggestions.title}
      </h2>
      <ul className="flex flex-col gap-2">
        {suggestions.meals.map((meal) => {
          const moment = formatMealMoment(meal.eaten_at, now)
          return (
            <li
              key={meal.id}
              className={`flex items-center justify-between gap-3 ${card}`}
            >
              <p className="min-w-0 text-sm">
                <span className="font-semibold tabular-nums">{moment}</span>
                {` · ${mealFoodsText(meal)} · `}
                <span className="whitespace-nowrap tabular-nums">{`${formatCarbs(meal.total_carbs_g)} g de HC`}</span>
              </p>
              <button
                type="button"
                className={`${button.secondary} shrink-0`}
                aria-label={`Repetir la comida ${ofMealMoment(meal.eaten_at, now)}`}
                onClick={() => onRepeat(meal)}
              >
                Repetir
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
