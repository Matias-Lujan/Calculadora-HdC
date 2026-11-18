import { useState } from 'react'
import { pageTitle } from '../../../components/styles.ts'
import {
  itemCarbsText,
  savedDoseNoteText,
  savedItemLines,
  savedItemQuantityText,
} from '../breakdown.ts'
import { formatMealDateTime } from '../eatenAt.ts'
import { appliedDoseText } from '../history.ts'
import type { SavedMeal } from '../types.ts'
import { CalculationDetails } from './CalculationDetails.tsx'
import { CopyMealSection } from './CopyMealSection.tsx'
import { DeleteMealSection } from './DeleteMealSection.tsx'

type Props = {
  meal: SavedMeal
}

/**
 * A saved meal (spec §6.7, UX-12): first a summary with the look of the dose
 * display (the carbs, the applied dose, and the calculated dose and the
 * ratio, small), then each food with how much was eaten and its carbs in
 * sight and its calculation folded under "Ver la cuenta", and at the end
 * the actions. Everything comes from the values saved in the record, not
 * from the current catalog: nothing is calculated again.
 */
export function MealDetail({ meal }: Props) {
  // "Hoy" and "Ayer" are relative to when the detail was opened.
  const [now] = useState(() => new Date())
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className={pageTitle}>Comida</h1>
        <p className="text-ink-soft tabular-nums">
          {formatMealDateTime(meal.eaten_at, now)}
        </p>
      </header>

      <div className="flex flex-col gap-2 rounded-display border border-transparent bg-display p-4 text-on-display shadow-level-2 dark:border-accent">
        <p className="font-display text-2xl font-semibold tabular-nums">
          {itemCarbsText(meal.total_carbs_g)}
        </p>
        <p className="text-base">
          {meal.applied_dose_units === null ? (
            'No anotaste cuánto te aplicaste.'
          ) : (
            <>
              Te aplicaste{' '}
              <strong className="font-display text-3xl font-bold whitespace-nowrap tabular-nums">
                {appliedDoseText(meal.applied_dose_units)}
              </strong>
            </>
          )}
        </p>
        <p className="text-xs text-on-display-soft tabular-nums">
          {savedDoseNoteText(
            meal.calculated_dose_units,
            meal.carb_ratio_g_per_unit,
          )}
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface px-4 shadow-level-1">
        {meal.meal_items.map((item) => (
          <li key={item.position} className="flex flex-col py-3">
            <span className="font-semibold">{item.food_name}</span>
            {item.food_brand !== null && (
              <span className="text-sm text-ink-soft">{item.food_brand}</span>
            )}
            <div className="flex items-baseline justify-between gap-3 pt-1">
              <span className="tabular-nums">
                {savedItemQuantityText(item)}
              </span>
              <span className="shrink-0 font-display font-semibold tabular-nums">
                {itemCarbsText(item.carbs_g)}
              </span>
            </div>
            <CalculationDetails lines={savedItemLines(item)} />
          </li>
        ))}
      </ul>

      <CopyMealSection meal={meal} />

      <DeleteMealSection meal={meal} />
    </article>
  )
}
