import { describe, expect, it } from 'vitest'
import type { Settings } from '../../lib/settings.ts'
import { mustAcceptUsageNotice } from './usageNotice.ts'

// Invented values.
const settings: Settings = {
  user_id: '00000000-0000-4000-8000-000000000001',
  carb_ratio_g_per_unit: 15,
  max_dose_warning_units: null,
  max_item_grams_warning: 500,
  usage_notice_accepted_at: null,
}

describe('mustAcceptUsageNotice', () => {
  it('shows the notice when it was never accepted', () => {
    expect(mustAcceptUsageNotice(settings)).toBe(true)
  })

  it('does not show it once accepted', () => {
    expect(
      mustAcceptUsageNotice({
        ...settings,
        usage_notice_accepted_at: '2026-11-18T12:00:00+00:00',
      }),
    ).toBe(false)
  })

  it('does not show it while the settings load or if reading them failed', () => {
    expect(mustAcceptUsageNotice(undefined)).toBe(false)
  })
})
