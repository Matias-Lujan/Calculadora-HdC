import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../lib/settings.ts'
import { supabase } from '../../lib/supabase.ts'
import { updateSettings } from './api.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: { from: vi.fn() } }))

// Invented values.
const saved: Settings = {
  user_id: '00000000-0000-4000-8000-000000000001',
  carb_ratio_g_per_unit: 12,
  max_dose_warning_units: 10,
  max_item_grams_warning: 500,
  usage_notice_accepted_at: '2026-11-18T12:00:00+00:00',
}

describe('updateSettings', () => {
  it('does not send the usage notice date, so saving the form keeps it accepted', async () => {
    const update = vi.fn()
    const builder = {
      update: (payload: unknown) => {
        update(payload)
        return builder
      },
      eq: () => builder,
      select: () => builder,
      single: () => Promise.resolve({ data: saved, error: null }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    await expect(
      updateSettings({
        userId: saved.user_id,
        values: {
          carb_ratio_g_per_unit: 12,
          max_dose_warning_units: 10,
          max_item_grams_warning: 500,
        },
      }),
    ).resolves.toEqual(saved)
    const payload = update.mock.calls[0]?.[0] as object
    expect(Object.keys(payload).sort()).toEqual([
      'carb_ratio_g_per_unit',
      'max_dose_warning_units',
      'max_item_grams_warning',
    ])
  })
})
