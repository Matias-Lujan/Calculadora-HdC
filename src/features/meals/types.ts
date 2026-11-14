import type { QuantityMode } from '../../domain/dose/index.ts'
import type { TablesInsert } from '../../lib/database.types.ts'
import type { Food } from '../../lib/foods.ts'

/**
 * One item of the meal being entered, as the form holds it.
 * - `key`: stable id of the item in the form (React key and field id). Its
 *   position in the meal is its index in the list.
 * - `food`: a copy of the food row taken when it was picked. Editing or
 *   archiving the food afterwards does not change the item, so what is
 *   saved is what was shown.
 * - `quantityText`: the quantity field, as typed (spec §8.7).
 */
export type MealItemDraft = {
  key: number
  food: Food
  quantityMode: QuantityMode
  quantityText: string
}

/**
 * A meal to insert (spec §7.1): the calculation result and the values that
 * produced it. Without id, user_id (column default, auth.uid()), notes
 * (not entered yet), deleted_at and created_at.
 */
export type NewMeal = Required<
  Pick<
    TablesInsert<'meals'>,
    | 'eaten_at'
    | 'carb_ratio_g_per_unit'
    | 'total_carbs_g'
    | 'calculated_dose_units'
    | 'applied_dose_units'
    | 'calc_version'
  >
>

/**
 * An item of a meal to insert: a copy of the food values used and the
 * result of its calculation (spec §6.7). meal_id is added by createMeal
 * once the meal exists; id and user_id come from the column defaults.
 */
export type NewMealItem = Required<
  Omit<TablesInsert<'meal_items'>, 'id' | 'user_id' | 'meal_id'>
>

/** What createMeal inserts: the meal and its items, in order. */
export type NewMealRecord = {
  meal: NewMeal
  items: NewMealItem[]
}
