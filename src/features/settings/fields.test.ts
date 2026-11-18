import { describe, expect, it } from 'vitest'
import {
  ALERT_FIELDS,
  DOSE_WARNING_INFO,
  GRAMS_WARNING_INFO,
  RATIO_LABEL_REST,
  RATIO_PHRASE_END,
  RATIO_PHRASE_START,
} from './fields.ts'
import type { SettingsValues } from './types.ts'

describe('the settings fields', () => {
  it('the ratio goes apart, then the two alerts, each once and in order', () => {
    const alerts: Record<
      Exclude<keyof SettingsValues, 'carb_ratio_g_per_unit'>,
      true
    > = {
      max_dose_warning_units: true,
      max_item_grams_warning: true,
    }
    expect(ALERT_FIELDS.map((field) => field.name)).toEqual(Object.keys(alerts))
  })

  it('the labels of the alerts, in plain words and without "U"', () => {
    expect(ALERT_FIELDS.map((field) => field.label)).toEqual([
      'Alerta de dosis máxima (unidades)',
      'Alerta de gramos por alimento (g)',
    ])
    for (const { label } of ALERT_FIELDS) expect(label).not.toMatch(/\bU\b/)
  })

  it('each alert has its own ⓘ', () => {
    expect(ALERT_FIELDS.map((field) => field.info)).toEqual([
      DOSE_WARNING_INFO,
      GRAMS_WARNING_INFO,
    ])
    expect(DOSE_WARNING_INFO).not.toBe(GRAMS_WARNING_INFO)
    expect(DOSE_WARNING_INFO).toMatch(/dosis/)
    expect(GRAMS_WARNING_INFO).toMatch(/gramos/)
  })

  it('the ⓘ of the alerts say they warn right away and ask before saving', () => {
    expect(DOSE_WARNING_INFO).toBe(
      'Si la dosis calculada da más que esto, la app te avisa en el momento y te pide que confirmes antes de guardar la comida.',
    )
    expect(GRAMS_WARNING_INFO).toBe(
      'Si cargás más gramos que esto de un solo alimento, la app te avisa en el momento y te pide que confirmes antes de guardar. Sirve para detectar un error de tipeo.',
    )
  })

  it('the ratio is a phrase, and its field is named with all of it', () => {
    expect(`${RATIO_PHRASE_START} [ 15 ] ${RATIO_PHRASE_END}`).toBe(
      '1 unidad de insulina cada [ 15 ] g de HC',
    )
    // The accessible name starts with the visible text (WCAG 2.5.3).
    expect(`${RATIO_PHRASE_START} ${RATIO_LABEL_REST}`).toBe(
      '1 unidad de insulina cada cuántos gramos de HC',
    )
  })
})
