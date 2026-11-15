import { describe, expect, it } from 'vitest'
import {
  DOSE_WARNING_INFO,
  GRAMS_WARNING_INFO,
  SETTINGS_FIELDS,
} from './fields.ts'
import type { SettingsValues } from './types.ts'

describe('SETTINGS_FIELDS', () => {
  it('has every setting once, in order', () => {
    const all: Record<keyof SettingsValues, true> = {
      carb_ratio_g_per_unit: true,
      max_dose_warning_units: true,
      max_item_grams_warning: true,
    }
    expect(SETTINGS_FIELDS.map((field) => field.name)).toEqual(Object.keys(all))
  })

  it('the labels, in plain words', () => {
    expect(SETTINGS_FIELDS.map((field) => field.label)).toEqual([
      'Ratio (g de HC por unidad)',
      'Alerta de dosis máxima (U)',
      'Alerta de gramos por alimento (g)',
    ])
  })

  it('only the two alerts have an ⓘ, each with its own text', () => {
    expect(SETTINGS_FIELDS.map((field) => field.info)).toEqual([
      undefined,
      DOSE_WARNING_INFO,
      GRAMS_WARNING_INFO,
    ])
    expect(DOSE_WARNING_INFO).not.toBe(GRAMS_WARNING_INFO)
    expect(DOSE_WARNING_INFO).toMatch(/dosis/)
    expect(GRAMS_WARNING_INFO).toMatch(/gramos/)
  })
})
