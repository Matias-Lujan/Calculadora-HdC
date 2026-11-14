import { describe, expect, it, vi } from 'vitest'
import { settingsSchema } from './settings.ts'

// settings.ts imports the Supabase client, which needs the VITE_ variables
// (missing in the CI). These tests only use the schema.
vi.mock('./supabase.ts', () => ({ supabase: {} }))

const row = {
  user_id: '00000000-0000-4000-8000-000000000001',
  carb_ratio_g_per_unit: 12.5,
  max_dose_warning_units: 10,
  max_item_grams_warning: 500,
}

describe('settingsSchema', () => {
  it('accepts a valid row', () => {
    expect(settingsSchema.parse(row)).toEqual(row)
  })

  it('accepts a dose threshold that is not configured yet (null)', () => {
    const value = { ...row, max_dose_warning_units: null }
    expect(settingsSchema.parse(value)).toEqual(value)
  })

  it('drops columns it does not know (updated_at)', () => {
    expect(
      settingsSchema.parse({ ...row, updated_at: '2026-11-13T00:00:00Z' }),
    ).toEqual(row)
  })

  it.each([
    'carb_ratio_g_per_unit',
    'max_dose_warning_units',
    'max_item_grams_warning',
  ])('rejects %s as a string', (key) => {
    expect(settingsSchema.safeParse({ ...row, [key]: '15' }).success).toBe(
      false,
    )
  })

  it.each([
    'user_id',
    'carb_ratio_g_per_unit',
    'max_dose_warning_units',
    'max_item_grams_warning',
  ])('rejects a row without %s', (key) => {
    const value: Record<string, unknown> = { ...row }
    delete value[key]
    expect(settingsSchema.safeParse(value).success).toBe(false)
  })

  it.each(['carb_ratio_g_per_unit', 'max_item_grams_warning'])(
    'rejects %s as null',
    (key) => {
      expect(settingsSchema.safeParse({ ...row, [key]: null }).success).toBe(
        false,
      )
    },
  )

  it.each([NaN, Infinity])('rejects %s', (value) => {
    expect(
      settingsSchema.safeParse({ ...row, carb_ratio_g_per_unit: value })
        .success,
    ).toBe(false)
  })

  it.each([null, undefined, 'x', []])('rejects the non-object %j', (value) => {
    expect(settingsSchema.safeParse(value).success).toBe(false)
  })
})

describe('settingsSchema, edge cases', () => {
  it.each([-Infinity, Infinity, NaN])(
    'rejects %s in every numeric column',
    (value) => {
      for (const key of [
        'carb_ratio_g_per_unit',
        'max_dose_warning_units',
        'max_item_grams_warning',
      ]) {
        expect(
          settingsSchema.safeParse({ ...row, [key]: value }).success,
          key,
        ).toBe(false)
      }
    },
  )

  it('rejects user_id as a number or null', () => {
    expect(settingsSchema.safeParse({ ...row, user_id: 1 }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...row, user_id: null }).success).toBe(
      false,
    )
  })

  it('rejects max_dose_warning_units as undefined (it must come, even null)', () => {
    expect(
      settingsSchema.safeParse({ ...row, max_dose_warning_units: undefined })
        .success,
    ).toBe(false)
  })

  it('keeps unrounded values as they come', () => {
    const value = { ...row, carb_ratio_g_per_unit: 0.1 + 0.2 }
    expect(settingsSchema.parse(value).carb_ratio_g_per_unit).toBe(0.1 + 0.2)
  })

  it('rejects an empty string in the threshold, even though null is allowed', () => {
    expect(
      settingsSchema.safeParse({ ...row, max_dose_warning_units: '' }).success,
    ).toBe(false)
  })
})
