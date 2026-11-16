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
        <h1 className="text-2xl font-semibold">Comida</h1>
        <p className="text-slate-500">{formatEatenAt(meal.eaten_at)}</p>
      </header>

      <ul className="flex flex-col gap-3">
        {meal.meal_items.map((item) => (
          <li
            key={item.position}
            className="flex flex-col gap-1 rounded-lg border border-slate-200 p-3"
          >
            <div className="flex flex-col">
              <span className="font-medium">{item.food_name}</span>
              {item.food_brand !== null && (
                <span className="text-sm text-slate-500">
                  {item.food_brand}
                </span>
              )}
            </div>
            <p className="font-medium">{itemCarbsText(item.carbs_g)}</p>
            <CalculationDetails lines={savedItemLines(item)} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 rounded-lg bg-slate-100 p-3">
        <p className="text-slate-700">{totalCarbsText(meal.total_carbs_g)}</p>
        <p className="text-xl font-semibold">
          {doseText(meal.calculated_dose_units)}
        </p>
        <p className="text-slate-700">
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
