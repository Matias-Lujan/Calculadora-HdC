import { describe, expect, it } from 'vitest'
import {
  cookingFactorFromWeights,
  isCookingFactorUnusual,
} from './cookingFactor.ts'

describe('cookingFactorFromWeights', () => {
  it('divides cooked weight by raw weight', () => {
    expect(cookingFactorFromWeights(100, 260)).toBe(260 / 100)
    expect(cookingFactorFromWeights(80, 200)).toBe(2.5)
  })

  it('returns 1 when both weights are equal', () => {
    expect(cookingFactorFromWeights(150, 150)).toBe(1)
  })

  it('does not round the result', () => {
    expect(cookingFactorFromWeights(30, 100)).toBe(100 / 30)
    expect(cookingFactorFromWeights(0.1, 0.25)).toBe(0.25 / 0.1)
  })

  it('accepts a cooked weight lower than the raw weight', () => {
    expect(cookingFactorFromWeights(200, 150)).toBe(0.75)
  })

  it('returns null when a weight is missing', () => {
    expect(cookingFactorFromWeights(null, 260)).toBeNull()
    expect(cookingFactorFromWeights(100, null)).toBeNull()
    expect(cookingFactorFromWeights(null, null)).toBeNull()
  })

  it.each([0, -0, -5, NaN, Infinity, -Infinity])(
    'returns null when the raw weight is %s',
    (raw) => {
      expect(cookingFactorFromWeights(raw, 260)).toBeNull()
    },
  )

  it.each([0, -0, -5, NaN, Infinity, -Infinity])(
    'returns null when the cooked weight is %s',
    (cooked) => {
      expect(cookingFactorFromWeights(100, cooked)).toBeNull()
    },
  )

  it('returns null when both weights are invalid, even if the quotient is positive', () => {
    expect(cookingFactorFromWeights(-100, -260)).toBeNull()
    expect(cookingFactorFromWeights(-Infinity, -Infinity)).toBeNull()
    expect(cookingFactorFromWeights(Infinity, Infinity)).toBeNull()
  })

  it('returns null when the quotient overflows', () => {
    expect(cookingFactorFromWeights(1e-10, 1e308)).toBeNull()
    expect(cookingFactorFromWeights(1e-10, 1e300)).toBeNull()
  })

  it('returns a quotient close to the overflow limit as is', () => {
    expect(cookingFactorFromWeights(1e-5, 1e300)).toBe(1e300 / 1e-5)
  })

  it('returns null when the quotient underflows to 0', () => {
    expect(cookingFactorFromWeights(1e10, Number.MIN_VALUE)).toBeNull()
  })

  it('accepts the extreme finite weights when the quotient is finite', () => {
    expect(cookingFactorFromWeights(Number.MAX_VALUE, Number.MAX_VALUE)).toBe(1)
    expect(cookingFactorFromWeights(Number.MIN_VALUE, Number.MIN_VALUE)).toBe(1)
  })

  it('returns a huge but finite quotient as is', () => {
    expect(cookingFactorFromWeights(1, 1e300)).toBe(1e300)
  })
})

describe('isCookingFactorUnusual', () => {
  it.each([1, 4, 2.6])('does not warn for %s', (factor) => {
    expect(isCookingFactorUnusual(factor)).toBe(false)
  })

  it.each([0.9999999, 4.0000001, Number.MIN_VALUE, 0.5, 4.5, 1e300])(
    'warns for %s',
    (factor) => {
      expect(isCookingFactorUnusual(factor)).toBe(true)
    },
  )
})

describe('measured factor and unusual warning together', () => {
  it('warns when the measured factor is above 4', () => {
    const factor = cookingFactorFromWeights(100, 450)
    expect(factor).not.toBeNull()
    expect(factor !== null && isCookingFactorUnusual(factor)).toBe(true)
  })

  it('warns when the measured factor is below 1 (cooked lighter than raw)', () => {
    const factor = cookingFactorFromWeights(200, 150)
    expect(factor).toBe(0.75)
    expect(factor !== null && isCookingFactorUnusual(factor)).toBe(true)
  })

  it('does not warn when the measured factor is exactly 1', () => {
    const factor = cookingFactorFromWeights(0.1, 0.1)
    expect(factor).toBe(1)
    expect(factor !== null && isCookingFactorUnusual(factor)).toBe(false)
  })

  it('does not warn when the measured factor is exactly 4', () => {
    const factor = cookingFactorFromWeights(100, 400)
    expect(factor).toBe(4)
    expect(factor !== null && isCookingFactorUnusual(factor)).toBe(false)
  })
})
