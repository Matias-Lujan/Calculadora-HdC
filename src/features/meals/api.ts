import { FunctionsHttpError } from '@supabase/supabase-js'
import { z } from 'zod'
import { GlucoseError, UnauthorizedError } from '../../lib/errors.ts'
import { supabase } from '../../lib/supabase.ts'
import { glucoseSuccessSchema } from '../../../supabase/functions/glucose-latest/contract.ts'
import {
  glucoseErrorSchema,
  type GlucoseReading,
  listedMealSchema,
  mealTimeSchema,
  recentMealSchema,
  savedGlucoseReadingSchema,
  type SavedGlucoseReading,
  referenceFoodSchema,
  savedMealSchema,
  type CreateMealPayload,
  type MealToSave,
  type MealsPage,
  type NewMealRecord,
  type NewTableFood,
  type RecentMeal,
  type ReferenceFood,
  type SavedMeal,
  type SavedMealResult,
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
 * fails, its error is thrown and the meal is not saved; the copies already
 * created stay, and a retry finds them (spec §14 #51).
 *
 * Then the meal and all its items are saved in a single call to the
 * create_meal function (spec §7.2), which inserts them in one transaction:
 * all or nothing. Its error is thrown as is. It carries the key of the meal
 * (`clientKey`): if that user already saved a meal with that key (a retry
 * after a lost answer, or saving again after coming back to Inicio), the
 * function inserts nothing and returns the id of that meal.
 */
export async function createMeal(
  record: NewMealRecord,
  clientKey: string,
): Promise<string> {
  const copies = new Map<string, string>()
  for (const { food } of record.items) {
    if ('copy' in food && !copies.has(food.copy.reference_code)) {
      copies.set(
        food.copy.reference_code,
        await findOrCreateTableFood(food.copy),
      )
    }
  }
  const payload: CreateMealPayload = {
    meal: { ...record.meal, client_key: clientKey },
    items: record.items.map(({ food, ...row }) => {
      const foodId =
        'id' in food ? food.id : copies.get(food.copy.reference_code)
      if (foodId === undefined) throw new Error('A table food was not resolved')
      return { ...row, food_id: foodId }
    }),
  }

  const { data, error } = await supabase.rpc('create_meal', { payload })
  if (error) throw error
  return z.guid().parse(data as unknown)
}

// The history (spec §6.7, §14 #47). Deleted meals (deleted_at) never show,
// and neither do meals without items (left in dev by failed saves before
// create_meal, #46): the `meal_items!inner` embed keeps only meals with at
// least one item.

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
      'id, eaten_at, total_carbs_g, calculated_dose_units, applied_dose_units, meal_items!inner(position, food_name)',
    )
    .is('deleted_at', null)
    .order('eaten_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + MEALS_PAGE_SIZE)
  if (error) throw error
  // The items come in any order: the list sorts the names by position.
  const rows = z.array(listedMealSchema).parse(data as unknown)
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
      'id, eaten_at, carb_ratio_g_per_unit, total_carbs_g, calculated_dose_units, applied_dose_units, meal_items!inner(position, food_id, food_name, food_brand, food_state, quantity_mode, units, unit_weight_g, grams, carbs_per_100g, cooking_factor, effective_carbs_per_100g, carbs_g)',
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

/** How many of the last meals the shortcuts of an empty Inicio read. */
export const RECENT_MEALS_LIMIT = 30

/**
 * The last meals, for the shortcuts of an empty Inicio (spec §6.6): the
 * RECENT_MEALS_LIMIT most recent ones by eaten_at (like the history: not
 * deleted, with at least one item), each with what "Recientes", "A esta
 * hora comiste" and "Repetir" need. The items come in any order.
 */
export async function fetchRecentMeals(): Promise<RecentMeal[]> {
  const { data, error } = await supabase
    .from('meals')
    .select(
      'id, eaten_at, total_carbs_g, meal_items!inner(position, food_id, food_name, quantity_mode, units, grams)',
    )
    .is('deleted_at', null)
    .order('eaten_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(RECENT_MEALS_LIMIT)
  if (error) throw error
  return z.array(recentMealSchema).parse(data as unknown)
}

/**
 * Saves a meal from Inicio (spec §6.6). A correction (spec §6.7, "Corregir")
 * is two requests, without a function in the base: first the new meal is
 * created, all or nothing, with createMeal (if it fails, its error is
 * thrown and nothing is deleted); then the corrected one is soft-deleted.
 * That second step is not filtered by deleted_at (like deleteMeal): a retry
 * with the same key gets the meal already created and finds the corrected
 * one already deleted by the first attempt, and that ends well too (spec
 * §14 #85). If it fails (the network, or the meal no longer exists), the new
 * meal stays saved and `replacedDeleted` is false.
 */
export async function saveMeal({
  record,
  replaces,
  clientKey,
}: MealToSave): Promise<SavedMealResult> {
  const id = await createMeal(record, clientKey)
  if (replaces === null) return { id, replacedDeleted: null }
  try {
    const { error } = await supabase
      .from('meals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', replaces)
      .select('id')
      .single()
    if (error) throw error
    return { id, replacedDeleted: true }
  } catch {
    return { id, replacedDeleted: false }
  }
}

/**
 * glucose-latest makes four calls to LibreLinkUp at most, of up to 10 s
 * each (spec §9.8): the client waits a bit longer.
 */
const GLUCOSE_TIMEOUT_MS = 45_000

/**
 * The error to throw for a failed call to glucose-latest: a 401 (from the
 * function or the platform, whatever its body) is UnauthorizedError; an
 * expected error of §9.8 is a GlucoseError; anything else (INTERNAL_ERROR,
 * a body that is not JSON, the network) is thrown as it came.
 */
async function glucoseFailure(error: unknown): Promise<unknown> {
  if (!(error instanceof FunctionsHttpError)) return error
  const response: unknown = error.context
  if (!(response instanceof Response)) return error
  if (response.status === 401) return new UnauthorizedError()
  const body: unknown = await response.json().catch(() => null)
  const parsed = glucoseErrorSchema.safeParse(body)
  if (!parsed.success) return error
  const { code, retryable, retry_at } = parsed.data.error
  return new GlucoseError(code, retryable, retry_at ?? null)
}

/**
 * The last reading of the sensor (spec §6.9, §9.8), validated with zod;
 * null if the sensor has none right now. A 200 with another shape throws.
 */
export async function fetchLatestGlucose(): Promise<GlucoseReading | null> {
  const { data, error } = await supabase.functions.invoke('glucose-latest', {
    timeout: GLUCOSE_TIMEOUT_MS,
  })
  if (error) throw await glucoseFailure(error)
  return glucoseSuccessSchema.parse(data as unknown).reading
}

/** The chart covers the last 24 hours (spec §6.10). */
const GLUCOSE_DAY_MS = 24 * 60 * 60 * 1000

/** The start of the last 24 hours, as the filters of the chart use it. */
function dayStart(): string {
  return new Date(Date.now() - GLUCOSE_DAY_MS).toISOString()
}

/**
 * The saved readings of the last 24 hours (spec §6.10, §7.1), oldest
 * first. RLS lets each user read only their own. One every ~15 min is
 * about 96 rows, far from the 1000 a response is cut at.
 */
export async function fetchGlucoseDay(): Promise<SavedGlucoseReading[]> {
  const { data, error } = await supabase
    .from('glucose_readings')
    .select('measured_at, mgdl')
    .gte('measured_at', dayStart())
    .order('measured_at', { ascending: true })
  if (error) throw error
  return z.array(savedGlucoseReadingSchema).parse(data as unknown)
}

/**
 * When each meal of the last 24 hours was eaten (not deleted), oldest
 * first, for the marks of the chart (spec §6.10). Only the time: the chart
 * shows neither carbs nor doses.
 */
export async function fetchDayMealTimes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('eaten_at')
    .is('deleted_at', null)
    .gte('eaten_at', dayStart())
    .order('eaten_at', { ascending: true })
  if (error) throw error
  return z
    .array(mealTimeSchema)
    .parse(data as unknown)
    .map((meal) => meal.eaten_at)
}
