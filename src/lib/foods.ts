import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { Tables } from './database.types.ts'
import { supabase } from './supabase.ts'

// The food row and the list of active foods, shared by the catalog
// (features/foods) and the meal screen (features/meals): a feature does not
// import another feature's internals (CLAUDE.md).

/**
 * Columns the app reads. Without user_id (RLS already filters by user),
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

// RLS returns only the user's own foods (spec §7.3).

/** Active foods (not archived). Sorted in the client, by searchFoods. */
export async function fetchFoods(): Promise<Food[]> {
  const { data, error } = await supabase
    .from('foods')
    .select(FOOD_COLUMNS)
    .is('archived_at', null)
  if (error) throw error
  return z.array(foodSchema).parse(data as unknown)
}

// The search is not part of the key: it filters the cached list in the client.
export const foodsKeys = {
  all: ['foods'] as const,
  list: ['foods', 'list'] as const,
  detail: (id: string) => ['foods', 'detail', id] as const,
}

/** The catalog list and the meal food picker read the same query. */
export function useFoods() {
  return useQuery({ queryKey: foodsKeys.list, queryFn: fetchFoods })
}
