import { describe, expect, it } from 'vitest'
import { TABLE_VALUE_INFO, cookedPer100gText, isFromTable } from './foodText.ts'

describe('cookedPer100gText', () => {
  it.each([
    [2.6, '100 g crudo rinden 260 g cocido'],
    [1.1, '100 g crudo rinden 110 g cocido'],
    [10 / 3, '100 g crudo rinden 333,3 g cocido'],
    [8 / 3, '100 g crudo rinden 266,7 g cocido'],
    [2.6805, '100 g crudo rinden 268,1 g cocido'],
    [0.9, '100 g crudo rinden 90 g cocido'],
    // 1.0045 * 100 is 100.44999999999999: multiplying in binary shows 100,4.
    [1.0045, '100 g crudo rinden 100,5 g cocido'],
    // 100.35 / 100 is 1.0034999999999998: normalized, it is shown as 100,4.
    [100.35 / 100, '100 g crudo rinden 100,4 g cocido'],
    [4, '100 g crudo rinden 400 g cocido'],
    [0.001, '100 g crudo rinden 0,1 g cocido'],
    // formatGrams follows the "es" locale: no separator with 4 digits.
    [12.5, '100 g crudo rinden 1250 g cocido'],
  ])('%s → %j', (factor, text) => {
    expect(cookedPer100gText(factor)).toBe(text)
  })

  it.each([0, -1, NaN, Infinity, -Infinity, 1e307, Number.MAX_VALUE])(
    '%s → null',
    (factor) => {
      expect(cookedPer100gText(factor)).toBeNull()
    },
  )
})

describe('isFromTable', () => {
  it('a USDA food, picked or copied, is from the table', () => {
    expect(isFromTable({ source: 'reference', reference_db: 'usda_fdc' })).toBe(
      true,
    )
  })

  it.each([
    ['reference', 'argenfoods'],
    ['reference', null],
    ['manual', null],
    ['label', null],
    ['manual', 'usda_fdc'],
    ['label', 'usda_fdc'],
  ] as const)('%s with %s is not', (source, referenceDb) => {
    expect(isFromTable({ source, reference_db: referenceDb })).toBe(false)
  })
})

describe('TABLE_VALUE_INFO', () => {
  it('says the value is a table average, in plain words', () => {
    expect(TABLE_VALUE_INFO).toBe(
      'Es el valor promedio de una tabla de alimentos. En lo que se cocina, como el arroz o los fideos, depende de cuánta agua absorbió: para más precisión, cargá el paquete en el catálogo y pesalo crudo y cocido.',
    )
  })
})

describe('cookedPer100gText: more edges', () => {
  it.each([
    [-0, null],
    [4.0004, '100 g crudo rinden 400 g cocido'],
    [3.999, '100 g crudo rinden 399,9 g cocido'],
  ])('%s → %j', (factor, text) => {
    expect(cookedPer100gText(factor)).toBe(text)
  })

  it('never says "factor"', () => {
    for (const factor of [0.5, 1, 2.6, 4, 10])
      expect(cookedPer100gText(factor)).not.toMatch(/factor/i)
  })
})
