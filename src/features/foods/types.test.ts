import { describe, expect, it } from 'vitest'
import { REFERENCE_DB_LABELS } from './types.ts'

describe('REFERENCE_DB_LABELS', () => {
  it('nombra cada base de referencia', () => {
    expect(REFERENCE_DB_LABELS).toEqual({
      argenfoods: 'ARGENFOODS',
      usda_fdc: 'USDA FoodData Central',
    })
  })
})
