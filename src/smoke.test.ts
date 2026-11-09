import { describe, expect, it } from 'vitest'

// Temporary: keeps the CI test step meaningful until stage 1 adds the
// domain tests. Delete this file then.
describe('smoke', () => {
  it('runs the test suite', () => {
    expect(1 + 1).toBe(2)
  })
})
