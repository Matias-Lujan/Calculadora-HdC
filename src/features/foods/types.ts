import type { Food } from '../../lib/foods.ts'

/**
 * What the food form saves (spec §6.5): the columns the user can edit.
 * source, reference_db, reference_code, reference_description, photo_path,
 * label_transcription, archived_at, user_id and the timestamps are not
 * edited from the form.
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
>

/**
 * A food to insert from the form: always manual (spec §6.3). user_id comes
 * from the column default (auth.uid()); reference_db, reference_code and
 * reference_description stay null by default.
 */
export type NewFood = FoodFormValues & { source: 'manual' }
