import type { Food } from '../../lib/foods.ts'

/** Name shown for each reference base (food detail and form). */
export const REFERENCE_DB_LABELS: Record<
  NonNullable<Food['reference_db']>,
  string
> = {
  argenfoods: 'ARGENFOODS',
  usda_fdc: 'USDA FoodData Central',
}

/**
 * What the food form saves (spec §6.5): the columns the user can edit.
 * source, reference_db, photo_path, label_transcription, archived_at,
 * user_id and the timestamps are not edited from the form.
 */
export type FoodFormValues = Pick<
  Food,
  | 'name'
  | 'brand'
  | 'state'
  | 'carbs_per_100g'
  | 'cooking_factor'
  | 'unit_weight_g'
  | 'unit_label'
  | 'notes'
  | 'reference_code'
  | 'reference_description'
>

/** Sources a food can be created with from the form (stage 4). */
export type FormSource = Extract<Food['source'], 'manual' | 'reference'>

/**
 * A food to insert. user_id comes from the column default (auth.uid()).
 */
export type NewFood = FoodFormValues & {
  source: FormSource
  reference_db: Extract<Food['reference_db'], 'argenfoods'> | null
}
