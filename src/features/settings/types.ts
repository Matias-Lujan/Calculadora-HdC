/**
 * What the form saves: only the three columns users can update (spec §7.3).
 * The dose threshold is required in the form, so it is never saved as null.
 * The settings row (Settings) and its schema live in lib/settings.ts.
 */
export type SettingsValues = {
  carb_ratio_g_per_unit: number
  max_dose_warning_units: number
  max_item_grams_warning: number
}
