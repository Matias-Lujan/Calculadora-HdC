import { z } from 'zod'
import { supabase } from '../../lib/supabase.ts'
import type { NewMealRecord } from './types.ts'

// RLS lets each user insert and read only their own meals (spec §7.3).
// user_id is not sent: the column default (auth.uid()) sets it.

const insertedMealSchema = z.object({ id: z.string() })

/**
 * Saves a meal and its items, and returns the id of the meal.
 *
 * Provisional until create_meal (stage 7, spec §7.2): it is not atomic.
 * First the meal is inserted, then all its items in a single request
 * (PostgREST inserts them in one transaction: all or none). If the items
 * fail, the meal is soft-deleted (deleted_at, the only column that can be
 * updated), so no visible meal is left without items, and the items' error
 * is thrown. If that update also fails, the meal stays visible without
 * items: the risk accepted until stage 7 (spec §14 #46).
 */
export async function createMeal(record: NewMealRecord): Promise<string> {
  const { data, error } = await supabase
    .from('meals')
    .insert(record.meal)
    .select('id')
    .single()
  if (error) throw error
  const { id } = insertedMealSchema.parse(data as unknown)

  const { error: itemsError } = await supabase
    .from('meal_items')
    .insert(record.items.map((item) => ({ ...item, meal_id: id })))
  if (itemsError) {
    // Its result is ignored, even if it throws: the error that matters is
    // the items' one.
    try {
      await supabase
        .from('meals')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
    } catch {
      // Nothing else to do: see the risk above.
    }
    throw itemsError
  }

  return id
}
