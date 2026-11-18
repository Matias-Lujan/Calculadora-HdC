import { useQuery, type QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import type { Tables } from './database.types.ts'
import { supabase } from './supabase.ts'

// The settings row and how it is read, shared by the settings screen
// (features/settings), the meal screen (features/meals) and the usage notice
// (features/auth): a feature does not import another feature's internals
// (CLAUDE.md).

/** The settings row, without `updated_at` (the app does not use it). */
export type Settings = Pick<
  Tables<'user_settings'>,
  | 'user_id'
  | 'carb_ratio_g_per_unit'
  | 'max_dose_warning_units'
  | 'max_item_grams_warning'
  | 'usage_notice_accepted_at'
>

/** Validates a settings row coming from Supabase (it enters as `unknown`). */
export const settingsSchema = z.object({
  user_id: z.string(),
  carb_ratio_g_per_unit: z.number(),
  max_dose_warning_units: z.number().nullable(),
  max_item_grams_warning: z.number(),
  usage_notice_accepted_at: z.string().nullable(),
}) satisfies z.ZodType<Settings>

export const SETTINGS_COLUMNS =
  'user_id, carb_ratio_g_per_unit, max_dose_warning_units, max_item_grams_warning, usage_notice_accepted_at'

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

/**
 * After the server confirms a save of the settings row (the settings form or
 * the usage notice): the row it returned goes to the cache of useSettings
 * right away, and then it is read again. Every screen has the new settings
 * at once, and they stay even if reading them again fails: the settings form
 * compares a new ratio with them (spec §6.8), and with the old row it would
 * ask to confirm a change that was already saved; the usage notice would
 * stay open after it was accepted.
 */
export function afterSettingsSaved(
  queryClient: QueryClient,
  row: Settings,
): Promise<void> {
  queryClient.setQueryData(settingsKeys.detail, row)
  return queryClient.invalidateQueries({ queryKey: settingsKeys.all })
}
