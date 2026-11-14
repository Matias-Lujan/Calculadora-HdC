import { z } from 'zod'
import type { QuantityMode } from '../../domain/dose/index.ts'
import type { Tables, TablesInsert } from '../../lib/database.types.ts'
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

// Saved meals, as the history reads them (spec §6.7). The rows enter as
// `unknown` and are validated here. `eaten_at` comes from PostgREST with an
// offset ("2026-11-14T16:05:00+00:00"), which z.iso.datetime() only accepts
// with `offset: true`; z.number() rejects NaN and infinities.

type MealSummaryRow = Pick<
  Tables<'meals'>,
  | 'id'
  | 'eaten_at'
  | 'total_carbs_g'
  | 'calculated_dose_units'
  | 'applied_dose_units'
>

/**
 * A meal in the history list. Unknown columns (like the `meal_items!inner`
 * embed used to filter) are dropped.
 */
export const mealSummarySchema = z.object({
  id: z.string(),
  eaten_at: z.iso.datetime({ offset: true }),
  total_carbs_g: z.number(),
  calculated_dose_units: z.number(),
  applied_dose_units: z.number().nullable(),
}) satisfies z.ZodType<MealSummaryRow>

export type MealSummary = z.infer<typeof mealSummarySchema>

/** One page of the history list; `hasMore` says whether there is a next one. */
export type MealsPage = {
  meals: MealSummary[]
  hasMore: boolean
}

type SavedMealItemRow = Pick<
  Tables<'meal_items'>,
  | 'position'
  | 'food_name'
  | 'food_brand'
  | 'food_state'
  | 'quantity_mode'
  | 'units'
  | 'unit_weight_g'
  | 'grams'
  | 'carbs_per_100g'
  | 'cooking_factor'
  | 'effective_carbs_per_100g'
  | 'carbs_g'
>

/**
 * An item of a saved meal: the copy of the food values and the result of
 * its calculation, as they were saved (spec §6.7). The enums narrow the
 * `text` columns to the values their CHECKs allow.
 */
export const savedMealItemSchema = z.object({
  position: z.number(),
  food_name: z.string(),
  food_brand: z.string().nullable(),
  food_state: z.enum(['as_eaten', 'raw_cooked']),
  quantity_mode: z.enum(['grams', 'units']),
  units: z.number().nullable(),
  unit_weight_g: z.number().nullable(),
  grams: z.number(),
  carbs_per_100g: z.number(),
  cooking_factor: z.number().nullable(),
  effective_carbs_per_100g: z.number(),
  carbs_g: z.number(),
}) satisfies z.ZodType<SavedMealItemRow>

export type SavedMealItem = z.infer<typeof savedMealItemSchema>

/**
 * A saved meal with its items, for the detail. A meal without items is not
 * valid.
 */
export const savedMealSchema = mealSummarySchema.extend({
  carb_ratio_g_per_unit: z.number(),
  meal_items: z.array(savedMealItemSchema).min(1),
}) satisfies z.ZodType<
  MealSummaryRow &
    Pick<Tables<'meals'>, 'carb_ratio_g_per_unit'> & {
      meal_items: SavedMealItemRow[]
    }
>

export type SavedMeal = z.infer<typeof savedMealSchema>
