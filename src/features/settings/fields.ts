import type { SettingsValues } from './types.ts'

/** The ⓘ of the dose alert (spec §6.8). */
export const DOSE_WARNING_INFO =
  'Si la dosis calculada da más que esto, la app te pide que confirmes antes de guardar la comida.'

/** The ⓘ of the grams alert (spec §6.8). */
export const GRAMS_WARNING_INFO =
  'Si cargás más gramos que esto de un solo alimento, la app te pide que confirmes antes de guardar. Sirve para detectar un error de tipeo.'

/** The fields of the settings form, in order, with their label and ⓘ. */
export const SETTINGS_FIELDS: {
  name: keyof SettingsValues
  label: string
  info?: string
}[] = [
  { name: 'carb_ratio_g_per_unit', label: 'Ratio (g de HC por unidad)' },
  {
    name: 'max_dose_warning_units',
    label: 'Alerta de dosis máxima (U)',
    info: DOSE_WARNING_INFO,
  },
  {
    name: 'max_item_grams_warning',
    label: 'Alerta de gramos por alimento (g)',
    info: GRAMS_WARNING_INFO,
  },
]
