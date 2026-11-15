import { describe, expect, it } from 'vitest'
import { calculateMeal } from './calculate.ts'
import {
  cookedGramsPer100gRaw,
  cookingFactorFromWeights,
  isCookingFactorUnusual,
  needsCookingFactor,
} from './cookingFactor.ts'
import { formatGrams } from './format.ts'
import type { DoseSettings } from './types.ts'

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

describe('needsCookingFactor', () => {
  it('raw_cooked without a factor → true', () => {
    expect(needsCookingFactor('raw_cooked', null)).toBe(true)
  })

  it('raw_cooked with a factor → false', () => {
    expect(needsCookingFactor('raw_cooked', 2.6)).toBe(false)
  })

  it('as_eaten without a factor → false', () => {
    expect(needsCookingFactor('as_eaten', null)).toBe(false)
  })

  it('as_eaten with a factor (should not exist) → false', () => {
    expect(needsCookingFactor('as_eaten', 2)).toBe(false)
  })

  it('a factor of 0 does not count as missing (it is INVALID_COOKING_FACTOR)', () => {
    expect(needsCookingFactor('raw_cooked', 0)).toBe(false)
  })

  it('a negative or non-finite factor does not count as missing either', () => {
    expect(needsCookingFactor('raw_cooked', -1)).toBe(false)
    expect(needsCookingFactor('raw_cooked', NaN)).toBe(false)
    expect(needsCookingFactor('raw_cooked', Infinity)).toBe(false)
  })

  const settings: DoseSettings = {
    carbRatioGPerUnit: 15,
    maxDoseWarningUnits: null,
    maxItemGramsWarning: 500,
  }

  it.each(
    (['as_eaten', 'raw_cooked'] as const).flatMap((state) =>
      [null, 0, 2.6, -1].map((factor) => [state, factor] as const),
    ),
  )(
    'is true exactly when calculateMeal reports MISSING_COOKING_FACTOR (%s, %s)',
    (state, factor) => {
      const result = calculateMeal(
        [
          {
            foodState: state,
            carbsPer100g: 50,
            cookingFactor: factor,
            unitWeightG: null,
            quantityMode: 'grams',
            quantity: 100,
          },
        ],
        settings,
      )
      const item = result.items[0]
      const missing =
        item !== undefined &&
        !item.ok &&
        item.errors.includes('MISSING_COOKING_FACTOR')
      expect(needsCookingFactor(state, factor)).toBe(missing)
    },
  )
})

describe('needsCookingFactor: bordes', () => {
  it('-Infinity and -0 do not count as missing (only null does)', () => {
    expect(needsCookingFactor('raw_cooked', -Infinity)).toBe(false)
    expect(needsCookingFactor('raw_cooked', -0)).toBe(false)
  })

  it('as_eaten never needs a factor, whatever it carries', () => {
    for (const factor of [null, 0, -1, NaN, Infinity, 2.6]) {
      expect(needsCookingFactor('as_eaten', factor)).toBe(false)
    }
  })

  const settings: DoseSettings = {
    carbRatioGPerUnit: 15,
    maxDoseWarningUnits: null,
    maxItemGramsWarning: 500,
  }

  it.each([NaN, Infinity, -Infinity, 0.5, 4.5])(
    'agrees with calculateMeal for the factor %s',
    (factor) => {
      for (const state of ['as_eaten', 'raw_cooked'] as const) {
        const item = calculateMeal(
          [
            {
              foodState: state,
              carbsPer100g: 30,
              cookingFactor: factor,
              unitWeightG: null,
              quantityMode: 'grams',
              quantity: 100,
            },
          ],
          settings,
        ).items[0]
        const missing =
          item !== undefined &&
          !item.ok &&
          item.errors.includes('MISSING_COOKING_FACTOR')
        expect(needsCookingFactor(state, factor)).toBe(missing)
      }
    },
  )
})

describe('cookedGramsPer100gRaw', () => {
  it.each([
    [2.6, 260],
    [1, 100],
    [4, 400],
    [0.75, 75],
  ])('%s → %s', (factor, grams) => {
    expect(cookedGramsPer100gRaw(factor)).toBe(grams)
  })

  it('moves the decimal point instead of multiplying in binary', () => {
    // 1.1 * 100 is 110.00000000000001.
    expect(1.1 * 100).not.toBe(110)
    expect(cookedGramsPer100gRaw(1.1)).toBe(110)
  })

  it('normalizes to 15 significant digits and does not round further', () => {
    // 10 / 3 is 3.3333333333333335: only the digits past the 15th go.
    expect(String(10 / 3)).toBe('3.3333333333333335')
    expect(cookedGramsPer100gRaw(10 / 3)).toBe(333.333333333333)
    expect(cookedGramsPer100gRaw(10 / 3)).not.toBe(Math.round(1000 / 3))
    expect(formatGrams(cookedGramsPer100gRaw(10 / 3) ?? NaN)).toBe('333,3')
    expect(cookedGramsPer100gRaw(2.123456789)).toBe(212.3456789)
    // 15 significant digits are kept as they are.
    expect(cookedGramsPer100gRaw(1.23456789012345)).toBe(123.456789012345)
  })

  it('handles numbers written with an exponent', () => {
    expect(cookedGramsPer100gRaw(1e-7)).toBe(0.00001)
    expect(cookedGramsPer100gRaw(1e21)).toBe(1e23)
  })

  it.each([0, -0, -1, -2.6, NaN, Infinity, -Infinity])(
    '%s → null',
    (factor) => {
      expect(cookedGramsPer100gRaw(factor)).toBeNull()
    },
  )

  it('a result that overflows is null, not Infinity', () => {
    expect(cookedGramsPer100gRaw(Number.MAX_VALUE)).toBeNull()
    expect(cookedGramsPer100gRaw(1e307)).toBeNull()
    expect(cookedGramsPer100gRaw(1e306)).toBe(1e308)
  })

  it('the smallest positive factor still gives a positive number', () => {
    expect(cookedGramsPer100gRaw(Number.MIN_VALUE)).toBeGreaterThan(0)
  })

  it('a usual factor where multiplying in binary would change what is shown', () => {
    // 1.0045 * 100 is 100.44999999999999, which formatGrams shows as "100,4".
    expect(1.0045 * 100).not.toBe(100.45)
    expect(formatGrams(1.0045 * 100)).toBe('100,4')
    expect(cookedGramsPer100gRaw(1.0045)).toBe(100.45)
    expect(formatGrams(cookedGramsPer100gRaw(1.0045) ?? NaN)).toBe('100,5')
    expect(cookedGramsPer100gRaw(1.2005)).toBe(120.05)
    expect(formatGrams(cookedGramsPer100gRaw(1.2005) ?? NaN)).toBe('120,1')
  })

  it('a very small factor gives its grams, not 0', () => {
    expect(cookedGramsPer100gRaw(0.001)).toBe(0.1)
    expect(cookedGramsPer100gRaw(0.0001)).toBe(0.01)
  })

  it('from 100 g raw, gives exactly the cooked weight typed (2 decimals, 100–400 g)', () => {
    // The quotient is not always exact in binary (100.26 / 100 is
    // 1.0026000000000002); the normalization to 15 significant digits
    // drops that noise.
    for (let hundredths = 10000; hundredths <= 40000; hundredths++) {
      const cooked = hundredths / 100
      const factor = cookingFactorFromWeights(100, cooked)
      expect(cookedGramsPer100gRaw(factor ?? NaN)).toBe(cooked)
    }
  })

  it('100 g raw and 100,35 g cooked is shown as 100,4', () => {
    // 100.35 / 100 is 1.0034999999999998 in binary; normalized to 15
    // significant digits it is 1.0035, so the grams are 100.35.
    const factor = cookingFactorFromWeights(100, 100.35)
    expect(factor).toBe(1.0034999999999998)
    expect(cookedGramsPer100gRaw(factor ?? NaN)).toBe(100.35)
    expect(formatGrams(cookedGramsPer100gRaw(factor ?? NaN) ?? NaN)).toBe(
      '100,4',
    )
  })

  it('round-trips with cookingFactorFromWeights(100, cooked)', () => {
    const grid: number[] = []
    for (let grams = 1; grams <= 1000; grams++) grid.push(grams)
    grid.push(262.5, 90.5, 0.5, 100.1, 333.3, 999.9, 12.25)
    for (const cooked of grid) {
      const factor = cookingFactorFromWeights(100, cooked)
      expect(factor).not.toBeNull()
      expect(cookedGramsPer100gRaw(factor ?? NaN)).toBe(cooked)
    }
  })
})

describe('cookedGramsPer100gRaw: bordes de la normalización', () => {
  /** Exact display of cooked × 100 / raw (weights in thousandths of a gram),
   * rounded half up to 1 decimal with integers, without a trailing ",0". */
  function exactDisplay(cookedMilli: bigint, rawMilli: bigint): string {
    const tenths = (2n * cookedMilli * 1000n + rawMilli) / (2n * rawMilli)
    const whole = tenths / 10n
    const decimal = tenths % 10n
    return decimal === 0n ? `${whole}` : `${whole},${decimal}`
  }

  function relativeError(factor: number): number {
    const grams = cookedGramsPer100gRaw(factor)
    if (grams === null) return Infinity
    return Math.abs(grams - factor * 100) / (factor * 100)
  }

  it.each([
    // 179.91 / 180 is 0.9994999999999999: multiplying gives 99.94999999999999
    // ("99,9"); the exact value is 99.95, shown as "100".
    [180, 179.91, 99.95, '100'],
    [470, 469.765, 99.95, '100'],
    // 468.09 / 180 is 2.6005, but 2.6005 * 100 is 260.04999999999995.
    [180, 468.09, 260.05, '260,1'],
    [470, 1222.235, 260.05, '260,1'],
    [180, 180.09, 100.05, '100,1'],
    [470, 470.235, 100.05, '100,1'],
    [470, 1175.235, 250.05, '250,1'],
  ])(
    'crudo %s g, cocido %s g → %s (se muestra "%s")',
    (raw, cooked, grams, shown) => {
      const factor = cookingFactorFromWeights(raw, cooked) ?? NaN
      expect(cookedGramsPer100gRaw(factor)).toBe(grams)
      expect(formatGrams(cookedGramsPer100gRaw(factor) ?? NaN)).toBe(shown)
    },
  )

  it('pesos con 3 decimales y crudo distinto de 100: lo que se muestra es el redondeo del valor exacto', () => {
    for (const rawMilli of [180_000n, 470_000n, 333_333n, 99_999n, 12_345n]) {
      for (
        let cookedMilli = 1n;
        cookedMilli <= 2_000_000n;
        cookedMilli += 211n
      ) {
        const factor =
          cookingFactorFromWeights(
            Number(rawMilli) / 1000,
            Number(cookedMilli) / 1000,
          ) ?? NaN
        const grams = cookedGramsPer100gRaw(factor)
        expect(grams).not.toBeNull()
        expect(formatGrams(grams ?? NaN)).toBe(
          exactDisplay(cookedMilli, rawMilli),
        )
      }
    }
  })

  it('en todo el rango normal queda a menos de 1e-13 relativo de factor × 100', () => {
    const mantissas = [
      1, 1.0000000000000002, 1.0034999999999998, 1.5, 2.6, 3.3333333333333335,
      9.999999999999998, 7.123456789012345,
    ]
    // Results that stay finite: factor up to ~1.79e306.
    for (let exponent = -307; exponent <= 305; exponent++) {
      for (const mantissa of mantissas) {
        const factor = mantissa * 10 ** exponent
        const grams = cookedGramsPer100gRaw(factor)
        expect(grams).not.toBeNull()
        expect(Number.isFinite(grams)).toBe(true)
        expect(grams).toBeGreaterThan(0)
        expect(relativeError(factor)).toBeLessThanOrEqual(1e-13)
      }
    }
    expect(relativeError(2.2250738585072014e-308)).toBeLessThanOrEqual(1e-13)
  })

  it('cerca del desborde: nunca Infinity ni NaN', () => {
    expect(cookedGramsPer100gRaw(1.79769313486231e306)).toBe(
      1.79769313486231e308,
    )
    expect(cookedGramsPer100gRaw(9.999999999999999e305)).toBe(1e308)
    for (const factor of [
      1.7976931348623156e306,
      1.797693134862316e306,
      1e307,
      1e308,
      Number.MAX_VALUE,
    ]) {
      const grams = cookedGramsPer100gRaw(factor)
      if (grams !== null) {
        expect(Number.isFinite(grams)).toBe(true)
        expect(grams).toBeGreaterThan(0)
      }
    }
    expect(cookedGramsPer100gRaw(Number.MAX_VALUE)).toBeNull()
  })

  it.each([Number.MIN_VALUE, 2 * Number.MIN_VALUE, 1e-320, 1e-310, 2.225e-308])(
    'subnormal %s → finito y > 0',
    (factor) => {
      const grams = cookedGramsPer100gRaw(factor)
      expect(grams).not.toBeNull()
      expect(Number.isFinite(grams)).toBe(true)
      expect(grams).toBeGreaterThan(0)
    },
  )
})
