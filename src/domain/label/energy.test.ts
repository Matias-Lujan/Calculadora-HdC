import { describe, expect, it } from 'vitest'
import { carbsExceedLabelEnergy, parseLabelEnergyKcal } from './energy.ts'

describe('parseLabelEnergyKcal', () => {
  it.each([
    '107 kcal',
    '107kcal',
    '107 Kcal',
    '107 kcal = 449 kJ',
    '449 kJ = 107 kcal',
    '107 kcal (449 kJ)',
  ])('"%s" da 107', (text) => {
    expect(parseLabelEnergyKcal(text)).toBe(107)
  })

  it('con coma decimal', () => {
    expect(parseLabelEnergyKcal('107,5 kcal')).toBe(107.5)
  })

  it('"0 kcal" da 0', () => {
    expect(parseLabelEnergyKcal('0 kcal')).toBe(0)
  })

  it.each([
    ['solo kJ', '449 kJ'],
    ['sin unidad', '107'],
    ['cota con <', '<4 kcal'],
    ['cota con ≤', '≤ 4 kcal'],
    ['cota en palabras', 'menos de 4 kcal'],
    ['cota en mayúsculas', 'Menos de 4 kcal'],
    ['negativo', '-5 kcal'],
    ['dos valores', '107 kcal / 120 kcal'],
    ['punto ambiguo', '1.234 kcal'],
    ['sin número', 'abc kcal'],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['demasiado grande', '9'.repeat(400) + ' kcal'],
  ])('%s: null', (_, text) => {
    expect(parseLabelEnergyKcal(text)).toBeNull()
  })

  it.each([
    'Valor energético 107 kcal = 449 kJ',
    'Valor energético: 107 kcal',
    '107kcal=449kJ',
    '449kJ/107kcal',
    '107 KCAL',
  ])('etiqueta real "%s" da 107', (text) => {
    expect(parseLabelEnergyKcal(text)).toBe(107)
  })

  it('"1.050,0 kcal" da 1050 (punto de miles con coma)', () => {
    expect(parseLabelEnergyKcal('1.050,0 kcal')).toBe(1050)
  })

  it.each([
    ['número después de kcal', 'kcal 107'],
    ['punto de miles ambiguo', '1.050 kcal'],
    ['solo kJ sin espacio', '449kJ'],
  ])('%s: null', (_, text) => {
    expect(parseLabelEnergyKcal(text)).toBeNull()
  })

  it('null da null', () => {
    expect(parseLabelEnergyKcal(null)).toBeNull()
  })
})

describe('carbsExceedLabelEnergy', () => {
  it('30 g de HC no caben en 107 kcal (una coma perdida); 3 g sí', () => {
    expect(
      carbsExceedLabelEnergy({ carbsG: 30, fiberG: null, energyKcal: 107 }),
    ).toBe(true)
    expect(
      carbsExceedLabelEnergy({ carbsG: 3, fiberG: null, energyKcal: 107 }),
    ).toBe(false)
  })

  it('con 0 kcal, el margen es de 4 kcal (1 g)', () => {
    expect(
      carbsExceedLabelEnergy({ carbsG: 1, fiberG: null, energyKcal: 0 }),
    ).toBe(false)
    expect(
      carbsExceedLabelEnergy({ carbsG: 1.01, fiberG: null, energyKcal: 0 }),
    ).toBe(true)
  })

  it('con 100 kcal, el límite es 109 kcal (27,25 g)', () => {
    expect(
      carbsExceedLabelEnergy({ carbsG: 27.25, fiberG: null, energyKcal: 100 }),
    ).toBe(false)
    expect(
      carbsExceedLabelEnergy({ carbsG: 27.26, fiberG: null, energyKcal: 100 }),
    ).toBe(true)
  })

  it('azúcar: 100 g de HC en 387 kcal no avisa', () => {
    expect(
      carbsExceedLabelEnergy({ carbsG: 100, fiberG: null, energyKcal: 387 }),
    ).toBe(false)
  })

  it('resta la fibra cargada; sin fibra (o con 0) no resta nada', () => {
    expect(
      carbsExceedLabelEnergy({ carbsG: 80, fiberG: 30, energyKcal: 260 }),
    ).toBe(false)
    expect(
      carbsExceedLabelEnergy({ carbsG: 80, fiberG: null, energyKcal: 260 }),
    ).toBe(true)
    expect(
      carbsExceedLabelEnergy({ carbsG: 80, fiberG: 0, energyKcal: 260 }),
    ).toBe(true)
  })

  it.each([
    ['HC null', { carbsG: null, fiberG: null, energyKcal: 0 }],
    ['HC NaN', { carbsG: NaN, fiberG: null, energyKcal: 0 }],
    ['HC infinitos', { carbsG: Infinity, fiberG: null, energyKcal: 0 }],
    ['HC negativos', { carbsG: -1, fiberG: null, energyKcal: 0 }],
    ['energía null', { carbsG: 30, fiberG: null, energyKcal: null }],
    ['energía NaN', { carbsG: 30, fiberG: null, energyKcal: NaN }],
    ['energía infinita', { carbsG: 30, fiberG: null, energyKcal: Infinity }],
    ['energía negativa', { carbsG: 30, fiberG: null, energyKcal: -1 }],
    ['fibra negativa', { carbsG: 30, fiberG: -1, energyKcal: 0 }],
    ['fibra NaN', { carbsG: 30, fiberG: NaN, energyKcal: 0 }],
    ['fibra mayor que los HC', { carbsG: 30, fiberG: 31, energyKcal: 0 }],
  ])('%s: false', (_, input) => {
    expect(carbsExceedLabelEnergy(input)).toBe(false)
  })

  it('no modifica la entrada', () => {
    const input = { carbsG: 80, fiberG: 30, energyKcal: 260 }
    carbsExceedLabelEnergy(input)
    expect(input).toEqual({ carbsG: 80, fiberG: 30, energyKcal: 260 })
  })
})
