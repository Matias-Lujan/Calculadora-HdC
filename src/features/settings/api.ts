import { supabase } from '../../lib/supabase.ts'
import { settingsSchema, type Settings, type SettingsValues } from './types.ts'

const SETTINGS_COLUMNS =
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

export type UpdateSettingsInput = {
  userId: string
  values: SettingsValues
}

// The payload only has the three columns users can update: user_id or
// updated_at would be rejected (42501). .single() fails if no row was
// updated, so "saved" is shown only when the server returns the row.
export async function updateSettings({
  userId,
  values,
}: UpdateSettingsInput): Promise<Settings> {
  const { data, error } = await supabase
    .from('user_settings')
    .update({
      carb_ratio_g_per_unit: values.carb_ratio_g_per_unit,
      max_dose_warning_units: values.max_dose_warning_units,
      max_item_grams_warning: values.max_item_grams_warning,
    })
    .eq('user_id', userId)
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) throw error
  return settingsSchema.parse(data as unknown)
}

// Here and not in features/auth, because a feature does not import another
// feature's internals. scope 'local' signs out only this device: the default,
// 'global', would also end the session of the installed app on the iPhone
// (spec §10). onAuthStateChange emits SIGNED_OUT, which clears the
// react-query cache and sends the user to the login.
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
}
