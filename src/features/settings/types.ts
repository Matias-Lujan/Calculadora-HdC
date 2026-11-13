import { z } from 'zod'
import type { Tables } from '../../lib/database.types.ts'

/** The settings row, without `updated_at` (the app does not use it). */
export type Settings = Pick<
  Tables<'user_settings'>,
  | 'user_id'
  | 'carb_ratio_g_per_unit'
  | 'max_dose_warning_units'
  | 'max_item_grams_warning'
>

/**
 * What the form saves: only the three columns users can update (spec §7.3).
 * The dose threshold is required in the form, so it is never saved as null.
 */
export type SettingsValues = {
  carb_ratio_g_per_unit: number
  max_dose_warning_units: number
  max_item_grams_warning: number
}

/** Validates a settings row coming from Supabase (it enters as `unknown`). */
export const settingsSchema = z.object({
  user_id: z.string(),
  carb_ratio_g_per_unit: z.number(),
  max_dose_warning_units: z.number().nullable(),
  max_item_grams_warning: z.number(),
}) satisfies z.ZodType<Settings>
