import { z } from 'zod'
import type { Tables } from '../../lib/database.types.ts'

/**
 * Columns the catalog reads. Without user_id (RLS already filters by user),
 * photo_path and label_transcription (stage 6) and the timestamps the app
 * does not show.
 */
export const FOOD_COLUMNS =
  'id, name, brand, source, state, carbs_per_100g, cooking_factor, unit_weight_g, unit_label, reference_db, reference_code, reference_description, notes, archived_at'

type FoodRow = Pick<
  Tables<'foods'>,
  | 'id'
  | 'name'
  | 'brand'
  | 'source'
  | 'state'
  | 'carbs_per_100g'
  | 'cooking_factor'
  | 'unit_weight_g'
  | 'unit_label'
  | 'reference_db'
  | 'reference_code'
  | 'reference_description'
  | 'notes'
  | 'archived_at'
>

/**
 * Validates a food row coming from Supabase (it enters as `unknown`).
 * The enums narrow the `text` columns to the values their CHECKs allow.
 */
export const foodSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  source: z.enum(['label', 'reference', 'manual']),
  state: z.enum(['as_eaten', 'raw_cooked']),
  carbs_per_100g: z.number(),
  cooking_factor: z.number().nullable(),
  unit_weight_g: z.number().nullable(),
  unit_label: z.string().nullable(),
  reference_db: z.enum(['usda_fdc', 'argenfoods']).nullable(),
  reference_code: z.string().nullable(),
  reference_description: z.string().nullable(),
  notes: z.string().nullable(),
  archived_at: z.string().nullable(),
}) satisfies z.ZodType<FoodRow>

export type Food = z.infer<typeof foodSchema>

/**
 * A food eaten cooked whose cooking factor is not loaded yet: it cannot be
 * used in a meal (same criterion as MISSING_COOKING_FACTOR, spec §8.4).
 * Not a calculation, so it lives in the feature.
 */
export function needsCookingFactor(
  food: Pick<Food, 'state' | 'cooking_factor'>,
): boolean {
  return food.state === 'raw_cooked' && food.cooking_factor === null
}
