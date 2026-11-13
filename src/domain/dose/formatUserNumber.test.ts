import { describe, expect, it } from 'vitest'
import { formatUserNumber } from './formatUserNumber.ts'
import { parseUserNumber } from './parseUserNumber.ts'

describe('formatUserNumber', () => {
  it.each([
    [15, '15'],
    [12.5, '12,5'],
    [1500, '1.500'],
    [1234567.25, '1.234.567,25'],
    [0.1, '0,1'],
    [0, '0'],
    [-0, '0'],
    [500, '500'],
    [1000, '1.000'],
    [0.30000000000000004, '0,30000000000000004'],
    [1e-7, '0,0000001'],
    [1.5e-7, '0,00000015'],
    [1e21, '1.000.000.000.000.000.000.000'],
    [1.5e21, '1.500.000.000.000.000.000.000'],
  ])('%s → %j', (value, expected) => {
    expect(formatUserNumber(value)).toBe(expected)
  })

  it.each([NaN, Infinity, -Infinity, -1, -0.5])('%s → ""', (value) => {
    expect(formatUserNumber(value)).toBe('')
  })

  it('does not round', () => {
    expect(formatUserNumber(2.675)).toBe('2,675')
    expect(formatUserNumber(1.005)).toBe('1,005')
    expect(formatUserNumber(12.345678901)).toBe('12,345678901')
  })

  it('round-trips 0.1 + 0.2 exactly', () => {
    const value = 0.1 + 0.2
    expect(parseUserNumber(formatUserNumber(value))).toBe(value)
  })

  it.each([Number.MIN_VALUE, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER])(
    'round-trips the extreme value %s',
    (value) => {
      expect(parseUserNumber(formatUserNumber(value))).toBe(value)
    },
  )

  it('round-trips generated values (fixed seed)', () => {
    for (const value of generateValues(2000, 20261113)) {
      const text = formatUserNumber(value)
      expect(parseUserNumber(text), `${value} → ${text}`).toBe(value)
    }
  })
})

/** Small deterministic PRNG (mulberry32), so generated cases are reproducible. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Values across many magnitudes (1e-12 to 1e25), with and without decimals. */
function generateValues(count: number, seed: number): number[] {
  const random = makeRandom(seed)
  const values: number[] = []
  for (let i = 0; i < count; i++) {
    const magnitude = 10 ** (Math.floor(random() * 38) - 12)
    const value = random() * magnitude
    values.push(i % 3 === 0 ? Math.round(value) : value)
  }
  return values
}

describe('formatUserNumber, exponent edge cases', () => {
  it.each([
    // String() gives an exponent with decimals.
    [1.234e-7, '0,0000001234'],
    [9.99e-7, '0,000000999'],
    [1.2345e21, '1.234.500.000.000.000.000.000'],
    [9.87654321e25, '98.765.432.100.000.000.000.000.000'],
    // Just outside the exponent range: String() writes them plain.
    [1e-6, '0,000001'],
    [1e20, '100.000.000.000.000.000.000'],
    [123456789012345680000, '123.456.789.012.345.680.000'],
  ])('%s → %j', (value, expected) => {
    expect(formatUserNumber(value)).toBe(expected)
  })

  it('writes Number.MIN_VALUE with every zero', () => {
    expect(formatUserNumber(Number.MIN_VALUE)).toBe(`0,${'0'.repeat(323)}5`)
  })

  it('writes Number.MAX_VALUE without an exponent', () => {
    const text = formatUserNumber(Number.MAX_VALUE)
    expect(text).toMatch(/^\d{3}(\.\d{3})*$/)
    expect(text.replaceAll('.', '')).toBe('17976931348623157' + '0'.repeat(292))
  })

  it('never has an exponent, a dot after the comma or leading zeros', () => {
    for (const value of generateValues(2000, 7)) {
      const text = formatUserNumber(value)
      expect(text, `${value}`).not.toMatch(/e/i)
      expect(text, `${value}`).toMatch(/^(0|[1-9]\d{0,2}(\.\d{3})*)(,\d+)?$/)
    }
  })

  it('is stable: formatting the parsed text gives the same text', () => {
    for (const value of generateValues(500, 99)) {
      const text = formatUserNumber(value)
      const parsed = parseUserNumber(text)
      expect(parsed).not.toBeNull()
      if (parsed === null) return
      expect(formatUserNumber(parsed)).toBe(text)
    }
  })

  it.each([Number.EPSILON, 2 ** 53 + 2, 0.1 + 0.7, 1 / 3])(
    'round-trips %s',
    (value) => {
      expect(parseUserNumber(formatUserNumber(value))).toBe(value)
    },
  )

  it.each([-Number.MIN_VALUE, -1e21, -1e-7])('negative %s → ""', (value) => {
    expect(formatUserNumber(value)).toBe('')
  })
})
