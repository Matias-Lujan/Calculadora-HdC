import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { Tables } from './database.types.ts'
import { supabase } from './supabase.ts'

// The settings row and how it is read, shared by the settings screen
// (features/settings) and the meal screen (features/meals): a feature does
// not import another feature's internals (CLAUDE.md).

/** The settings row, without `updated_at` (the app does not use it). */
export type Settings = Pick<
  Tables<'user_settings'>,
  | 'user_id'
  | 'carb_ratio_g_per_unit'
  | 'max_dose_warning_units'
  | 'max_item_grams_warning'
>

/** Validates a settings row coming from Supabase (it enters as `unknown`). */
export const settingsSchema = z.object({
  user_id: z.string(),
  carb_ratio_g_per_unit: z.number(),
  max_dose_warning_units: z.number().nullable(),
  max_item_grams_warning: z.number(),
}) satisfies z.ZodType<Settings>

export const SETTINGS_COLUMNS =
  'user_id, carb_ratio_g_per_unit, max_dose_warning_units, max_item_grams_warning'

// RLS returns only the user's own row (spec §7.3).
export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) throw error
  return settingsSchema.parse(data as unknown)
}

export const settingsKeys = {
  all: ['settings'] as const,
  detail: ['settings', 'detail'] as const,
}

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.detail, queryFn: fetchSettings })
}
