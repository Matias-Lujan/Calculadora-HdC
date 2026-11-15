import { z } from 'zod'
import { FOOD_COLUMNS, foodSchema, type Food } from '../../lib/foods.ts'
import { supabase } from '../../lib/supabase.ts'
import type { FoodFormValues, NewFood } from './types.ts'

// RLS returns only the user's own foods (spec §7.3). The list of active
// foods (fetchFoods) lives in lib/foods.ts, shared with the meal screen.

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

/**
 * Creates a food. user_id is not sent: the column default (auth.uid()) sets
 * it, and RLS checks it. Returns the saved row.
 */
export async function createFood(row: NewFood): Promise<Food> {
  const { data, error } = await supabase
    .from('foods')
    .insert(row)
    .select(FOOD_COLUMNS)
    .single()
  if (error) throw error
  return foodSchema.parse(data as unknown)
}

export type UpdateFoodInput = {
  id: string
  values: FoodFormValues
}

/**
 * Updates the editable columns of a food (spec §6.5). The payload never has
 * source, reference_db, reference_code, reference_description, photo_path,
 * label_transcription, archived_at, user_id or the timestamps (updated_at is
 * set by a trigger): editing a reference food keeps its source, base, code
 * and description, so foods_reference_requires_source still holds. .single()
 * fails if no row was updated, so "saved" is shown only when the server
 * returns the row.
 */
export async function updateFood({
  id,
  values,
}: UpdateFoodInput): Promise<Food> {
  const { data, error } = await supabase
    .from('foods')
    .update({
      name: values.name,
      brand: values.brand,
      state: values.state,
      carbs_per_100g: values.carbs_per_100g,
      cooking_factor: values.cooking_factor,
      unit_weight_g: values.unit_weight_g,
      unit_label: values.unit_label,
      notes: values.notes,
    })
    .eq('id', id)
    .select(FOOD_COLUMNS)
    .single()
  if (error) throw error
  return foodSchema.parse(data as unknown)
}

/**
 * Archives a food (spec §6.5): it leaves the catalog and cannot be used
 * again; past meals keep pointing to it. The client sets the date because
 * the column has no default or trigger. Not filtered by archived_at is null:
 * archiving again only overwrites the date, instead of failing for nothing.
 */
export async function archiveFood(id: string): Promise<Food> {
  const { data, error } = await supabase
    .from('foods')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select(FOOD_COLUMNS)
    .single()
  if (error) throw error
  return foodSchema.parse(data as unknown)
}
