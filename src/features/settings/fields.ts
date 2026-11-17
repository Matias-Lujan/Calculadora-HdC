import type { SettingsValues } from './types.ts'

/**
 * The ratio, written as a phrase with its field in the middle (spec §6.8):
 * "1 unidad de insulina cada [ 15 ] g de HC". The field is named with the
 * whole phrase: the visible start plus RATIO_LABEL_REST, which only screen
 * readers get (the visible "g de HC" after the field is hidden from them).
 */
export const RATIO_PHRASE_START = '1 unidad de insulina cada'
export const RATIO_LABEL_REST = 'cuántos gramos de HC'
export const RATIO_PHRASE_END = 'g de HC'

/** The ⓘ of the dose alert (spec §6.8). */
export const DOSE_WARNING_INFO =
  'Si la dosis calculada da más que esto, la app te avisa en el momento y te pide que confirmes antes de guardar la comida.'

/** The ⓘ of the grams alert (spec §6.8). */
export const GRAMS_WARNING_INFO =
  'Si cargás más gramos que esto de un solo alimento, la app te avisa en el momento y te pide que confirmes antes de guardar. Sirve para detectar un error de tipeo.'

/** The two alerts, in order, with their label and ⓘ (the ratio goes apart). */
export const ALERT_FIELDS: {
  name: Exclude<keyof SettingsValues, 'carb_ratio_g_per_unit'>
  label: string
  info: string
}[] = [
  {
    name: 'max_dose_warning_units',
    label: 'Alerta de dosis máxima (unidades)',
    info: DOSE_WARNING_INFO,
  },
  {
    name: 'max_item_grams_warning',
    label: 'Alerta de gramos por alimento (g)',
    info: GRAMS_WARNING_INFO,
  },
]
