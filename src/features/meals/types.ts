import { z } from 'zod'
import type { QuantityMode } from '../../domain/dose/index.ts'
import type { Tables, TablesInsert } from '../../lib/database.types.ts'
import type { Food } from '../../lib/foods.ts'

type ReferenceFoodRow = Pick<
  Tables<'reference_foods'>,
  | 'reference_db'
  | 'reference_code'
  | 'description_original'
  | 'name_es'
  | 'state'
  | 'carbs_per_100g'
>

/**
 * A food of the reference table (spec §5.2), as the meal screen reads it.
 * Only the USDA rows of foods eaten as they are (`as_eaten`) are read: a
 * `raw_cooked` one would need a cooking factor the table does not have
 * (spec §6.2, §14 #51).
 */
export const referenceFoodSchema = z.object({
  reference_db: z.literal('usda_fdc'),
  reference_code: z.string(),
  description_original: z.string(),
  name_es: z.string(),
  state: z.literal('as_eaten'),
  carbs_per_100g: z.number(),
}) satisfies z.ZodType<ReferenceFoodRow>

export type ReferenceFood = z.infer<typeof referenceFoodSchema>

/**
 * A food that can go in a meal: a food of the catalog, or a food of the
 * reference table not copied to the catalog yet (`id === null`, spec §6.2).
 */
export type MealFood = Omit<Food, 'id'> & { id: string | null }

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
  food: MealFood
  quantityMode: QuantityMode
  quantityText: string
}

/**
 * The copy of a reference table food that createMeal looks for in the
 * catalog, or inserts if there is none (spec §6.2). Without user_id (column
 * default, auth.uid()).
 */
export type NewTableFood = Required<
  Pick<
    TablesInsert<'foods'>,
    | 'name'
    | 'brand'
    | 'source'
    | 'state'
    | 'carbs_per_100g'
    | 'reference_db'
    | 'reference_code'
    | 'reference_description'
  >
> & {
  source: 'reference'
  reference_db: 'usda_fdc'
  reference_code: string
}

/**
 * The food an item points to: a food of the catalog (its id), or the copy
 * of a reference table food that createMeal resolves before the meal.
 */
export type MealItemFood = { id: string } | { copy: NewTableFood }

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
 * result of its calculation (spec §6.7), and the food it points to.
 * createMeal turns `food` into food_id (resolving the copy of a reference
 * table food first); create_meal sets meal_id, and id and user_id come from
 * the column defaults.
 */
export type NewMealItem = Required<
  Omit<TablesInsert<'meal_items'>, 'id' | 'user_id' | 'meal_id' | 'food_id'>
> & { food: MealItemFood }

/** What createMeal inserts: the meal and its items, in order. */
export type NewMealRecord = {
  meal: NewMeal
  items: NewMealItem[]
}

/**
 * The payload of the create_meal function (spec §7.2): the record, with
 * each item's food already resolved to its food_id. The function reads only
 * these keys; user_id, meal_id and id come from the column defaults.
 */
export type CreateMealPayload = {
  meal: NewMeal
  items: (Omit<NewMealItem, 'food'> & { food_id: string })[]
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

/**
 * A meal in the history list, with the names of its foods (spec §6.7). The
 * `meal_items!inner` embed keeps only meals with at least one item, so a
 * meal without items is not valid.
 */
export const listedMealSchema = mealSummarySchema.extend({
  meal_items: z
    .array(
      z.object({
        position: z.number(),
        food_name: z.string(),
      }) satisfies z.ZodType<
        Pick<Tables<'meal_items'>, 'position' | 'food_name'>
      >,
    )
    .min(1),
})

export type ListedMeal = z.infer<typeof listedMealSchema>

/** One page of the history list; `hasMore` says whether there is a next one. */
export type MealsPage = {
  meals: ListedMeal[]
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
