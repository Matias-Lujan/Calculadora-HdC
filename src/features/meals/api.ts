import { z } from 'zod'
import { supabase } from '../../lib/supabase.ts'
import {
  mealSummarySchema,
  referenceFoodSchema,
  savedMealSchema,
  type MealsPage,
  type NewMealRecord,
  type NewTableFood,
  type ReferenceFood,
  type SavedMeal,
} from './types.ts'

// RLS lets each user insert and read only their own meals (spec §7.3).
// user_id is not sent: the column default (auth.uid()) sets it.

const insertedIdSchema = z.object({ id: z.string() })

/**
 * The USDA foods of the reference table (spec §5.2) that are eaten as they
 * are (`as_eaten`, spec §14 #51), all at once: they are
 * fewer than the 1000 rows a Supabase response is cut at. Any signed-in
 * user can read them (spec §7.3).
 */
export async function fetchReferenceFoods(): Promise<ReferenceFood[]> {
  const { data, error } = await supabase
    .from('reference_foods')
    .select(
      'reference_db, reference_code, description_original, name_es, state, carbs_per_100g',
    )
    .eq('reference_db', 'usda_fdc')
    .eq('state', 'as_eaten')
  if (error) throw error
  return z.array(referenceFoodSchema).parse(data as unknown)
}

/**
 * The id of the user's copy of a reference table food (spec §6.2, §14 #51):
 * the oldest active one with that code, read from the server (not the
 * cache). If there is none, the copy is inserted. There is no unique index:
 * two tabs saving at once can leave two copies, which is accepted.
 */
export async function findOrCreateTableFood(
  copy: NewTableFood,
): Promise<string> {
  const { data, error } = await supabase
    .from('foods')
    .select('id')
    .eq('source', 'reference')
    .eq('reference_db', copy.reference_db)
    .eq('reference_code', copy.reference_code)
    .is('archived_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (data !== null) return insertedIdSchema.parse(data as unknown).id

  const { data: inserted, error: insertError } = await supabase
    .from('foods')
    .insert(copy)
    .select('id')
    .single()
  if (insertError) throw insertError
  return insertedIdSchema.parse(inserted as unknown).id
}

/**
 * Saves a meal and its items, and returns the id of the meal.
 *
 * First, each reference table food of the meal (one per code, in order) is
 * resolved to its copy in the catalog, with findOrCreateTableFood. If one
 * fails, its error is thrown and the meal is not inserted; the copies
 * already created stay, and a retry finds them (spec §14 #51).
 *
 * Provisional until create_meal (stage 7, spec §7.2): it is not atomic.
 * Then the meal is inserted, then all its items in a single request
 * (PostgREST inserts them in one transaction: all or none). If the items
 * fail, the meal is soft-deleted (deleted_at, the only column that can be
 * updated), so no visible meal is left without items, and the items' error
 * is thrown. If that update also fails, the meal stays visible without
 * items: the risk accepted until stage 7 (spec §14 #46).
 */
export async function createMeal(record: NewMealRecord): Promise<string> {
  const copies = new Map<string, string>()
  for (const { food } of record.items) {
    if ('copy' in food && !copies.has(food.copy.reference_code)) {
      copies.set(
        food.copy.reference_code,
        await findOrCreateTableFood(food.copy),
      )
    }
  }
  const rows = record.items.map(({ food, ...row }) => {
    const foodId = 'id' in food ? food.id : copies.get(food.copy.reference_code)
    if (foodId === undefined) throw new Error('A table food was not resolved')
    return { ...row, food_id: foodId }
  })

  const { data, error } = await supabase
    .from('meals')
    .insert(record.meal)
    .select('id')
    .single()
  if (error) throw error
  const { id } = insertedIdSchema.parse(data as unknown)

  const { error: itemsError } = await supabase
    .from('meal_items')
    .insert(rows.map((row) => ({ ...row, meal_id: id })))
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

// The history (spec §6.7, §14 #47). Deleted meals (deleted_at) never show,
// and neither do meals without items (a failed provisional save, #46): the
// `meal_items!inner` embed keeps only meals with at least one item.

/** Meals per page of the history list. */
export const MEALS_PAGE_SIZE = 50

/**
 * A page of the history list, most recent first, from `offset` (0-based).
 * It asks for one row more than the page: the extra row only says whether
 * there is a next page, and is not returned. created_at breaks ties between
 * meals eaten at the same instant, so the order is stable between pages.
 */
export async function fetchMealsPage(offset: number): Promise<MealsPage> {
  const { data, error } = await supabase
    .from('meals')
    .select(
      'id, eaten_at, total_carbs_g, calculated_dose_units, applied_dose_units, meal_items!inner(id)',
    )
    .is('deleted_at', null)
    .order('eaten_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + MEALS_PAGE_SIZE)
  if (error) throw error
  // zod drops the meal_items embed, which is only used to filter.
  const rows = z.array(mealSummarySchema).parse(data as unknown)
  return {
    meals: rows.slice(0, MEALS_PAGE_SIZE),
    hasMore: rows.length > MEALS_PAGE_SIZE,
  }
}

/**
 * A saved meal with its items in order, from the values stored in the
 * record (never the catalog). Returns null when it does not exist, is
 * deleted, is another user's or has no items. An id that is not a UUID
 * would make Postgres fail (22P02), so it is answered as "not found"
 * without querying (like fetchFood).
 */
export async function fetchMeal(id: string): Promise<SavedMeal | null> {
  if (!z.guid().safeParse(id).success) return null
  const { data, error } = await supabase
    .from('meals')
    .select(
      'id, eaten_at, carb_ratio_g_per_unit, total_carbs_g, calculated_dose_units, applied_dose_units, meal_items!inner(position, food_name, food_brand, food_state, quantity_mode, units, unit_weight_g, grams, carbs_per_100g, cooking_factor, effective_carbs_per_100g, carbs_g)',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .order('position', { referencedTable: 'meal_items' })
    .maybeSingle()
  if (error) throw error
  if (data === null) return null
  return savedMealSchema.parse(data as unknown)
}

/**
 * Soft-deletes a meal (spec §6.7): it leaves the history and cannot be
 * recovered. The client sets the date (the column has no default or
 * trigger). Not filtered by deleted_at is null, like archiveFood (#40):
 * deleting again only overwrites the date. The select policy of meals does
 * not filter deleted meals, so the row comes back, and .single() fails if
 * no row was updated (another user's, or one that does not exist).
 */
export async function deleteMeal(id: string): Promise<void> {
  const { error } = await supabase
    .from('meals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
}
