import { card, pageTitle } from '../../../components/styles.ts'
import {
  doseLine,
  doseText,
  itemCarbsText,
  savedItemLines,
  totalCarbsText,
} from '../breakdown.ts'
import { formatEatenAt } from '../eatenAt.ts'
import { appliedDoseText } from '../history.ts'
import type { SavedMeal } from '../types.ts'
import { CalculationDetails } from './CalculationDetails.tsx'
import { DeleteMealSection } from './DeleteMealSection.tsx'

type Props = {
  meal: SavedMeal
}

/**
 * A saved meal (spec §6.7): the breakdown as it was calculated, from the
 * values saved in the record and not from the current catalog. Nothing is
 * calculated again: the saved numbers are formatted with the same texts as
 * the meal screen, with the calculation folded under "Ver la cuenta".
 */
export function MealDetail({ meal }: Props) {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className={pageTitle}>Comida</h1>
        <p className="text-ink-soft tabular-nums">
          {formatEatenAt(meal.eaten_at)}
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {meal.meal_items.map((item) => (
          <li key={item.position} className={`flex flex-col gap-1 ${card}`}>
            <div className="flex flex-col">
              <span className="font-semibold">{item.food_name}</span>
              {item.food_brand !== null && (
                <span className="text-sm text-ink-soft">{item.food_brand}</span>
              )}
            </div>
            <p className="font-display font-semibold tabular-nums">
              {itemCarbsText(item.carbs_g)}
            </p>
            <CalculationDetails lines={savedItemLines(item)} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 rounded-card bg-sunken p-4">
        <p className="font-display tabular-nums">
          {totalCarbsText(meal.total_carbs_g)}
        </p>
        <p className="font-display text-xl font-semibold tabular-nums">
          {doseText(meal.calculated_dose_units)}
        </p>
        <p className="font-display tabular-nums">
          Dosis aplicada: {appliedDoseText(meal.applied_dose_units)}
        </p>
        <CalculationDetails
          lines={[
            doseLine(
              meal.total_carbs_g,
              meal.carb_ratio_g_per_unit,
              meal.calculated_dose_units,
            ),
          ]}
        />
      </div>

      <DeleteMealSection meal={meal} />
    </article>
  )
}
