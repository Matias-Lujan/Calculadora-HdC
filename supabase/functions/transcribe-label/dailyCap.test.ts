import { describe, expect, it } from 'vitest'
import { startOfToday } from './dailyCap.ts'

describe('startOfToday', () => {
  it('a las 23:59:59 de Buenos Aires sigue siendo el mismo día', () => {
    expect(startOfToday(new Date('2026-11-15T02:59:59Z'))).toBe(
      '2026-11-14T00:00:00-03:00',
    )
  })

  it('a la medianoche de Buenos Aires empieza el día nuevo', () => {
    expect(startOfToday(new Date('2026-11-15T03:00:00Z'))).toBe(
      '2026-11-15T00:00:00-03:00',
    )
  })
})
