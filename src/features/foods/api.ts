import { FunctionsHttpError } from '@supabase/supabase-js'
import { z } from 'zod'
import type { TablesInsert } from '../../lib/database.types.ts'
import { UnauthorizedError, VisionError } from '../../lib/errors.ts'
import { FOOD_COLUMNS, foodSchema, type Food } from '../../lib/foods.ts'
import { supabase } from '../../lib/supabase.ts'
import {
  transcribeErrorSchema,
  transcribeSuccessSchema,
  type Transcription,
} from './transcription.ts'
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
  // Typed as the insert row: supabase-js does not take the union directly.
  const insert: TablesInsert<'foods'> = row
  const { data, error } = await supabase
    .from('foods')
    .insert(insert)
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

// Label photos (spec §6.1, §7.4): private bucket, one folder per user.
const PHOTO_BUCKET = 'food-photos'

/** How long a signed photo URL lasts, in seconds (spec §7.4). */
const PHOTO_URL_SECONDS = 600

/**
 * The transcribe-label function waits for Gemini, with one retry (spec
 * §9.3, about 20 s at worst): the client gives it up to a minute.
 */
const TRANSCRIBE_TIMEOUT_MS = 60_000

/**
 * Uploads a label photo (already a JPEG, photo.ts) to
 * `{user_id}/{uuid}.jpg` and returns its path. Without a session it throws
 * UnauthorizedError, which takes the user to the login.
 */
export async function uploadLabelPhoto(photo: Blob): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const userId = data.session?.user.id
  if (userId === undefined) throw new UnauthorizedError()
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw uploadError
  return path
}

/**
 * The error to throw for a failed call to transcribe-label: a 401 (from
 * the function or the platform, whatever its body, spec §9.3) is
 * UnauthorizedError; an expected error of §9.3 is a VisionError; anything
 * else (INTERNAL_ERROR, a body that is not JSON, the network) is thrown as
 * it came, as an unexpected error.
 */
async function transcribeFailure(error: unknown): Promise<unknown> {
  if (!(error instanceof FunctionsHttpError)) return error
  const response: unknown = error.context
  if (!(response instanceof Response)) return error
  if (response.status === 401) return new UnauthorizedError()
  const body: unknown = await response.json().catch(() => null)
  const parsed = transcribeErrorSchema.safeParse(body)
  if (!parsed.success) return error
  return new VisionError(parsed.data.error.code, parsed.data.error.retryable)
}

/**
 * Asks transcribe-label to read the photo at `path` (spec §9.3). Returns
 * the transcription validated with zod; a 200 with another shape throws.
 */
export async function transcribeLabel(path: string): Promise<Transcription> {
  const { data, error } = await supabase.functions.invoke('transcribe-label', {
    body: { storage_path: path },
    timeout: TRANSCRIBE_TIMEOUT_MS,
  })
  if (error) throw await transcribeFailure(error)
  return transcribeSuccessSchema.parse(data as unknown).transcription
}

/** Deletes a label photo (when the user cancels, spec §6.1). */
export async function deleteLabelPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
  if (error) throw error
}

/** A signed URL to show a label photo for 10 minutes (spec §7.4). */
export async function createLabelPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, PHOTO_URL_SECONDS)
  if (error) throw error
  return data.signedUrl
}
