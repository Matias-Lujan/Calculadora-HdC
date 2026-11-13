import { z } from 'zod'
import { supabase } from '../../lib/supabase.ts'
import { FOOD_COLUMNS, foodSchema, type Food } from './types.ts'

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

/**
 * One food, archived or not. Returns null when it does not exist (or is
 * another user's). An id that is not a UUID would make Postgres fail
 * (22P02), so it is answered as "not found" without querying.
 */
export async function fetchFood(id: string): Promise<Food | null> {
  if (!z.guid().safeParse(id).success) return null
  const { data, error } = await supabase
    .from('foods')
    .select(FOOD_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (data === null) return null
  return foodSchema.parse(data as unknown)
}
