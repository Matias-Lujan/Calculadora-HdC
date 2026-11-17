import { describe, expect, it } from 'vitest'
import { doseForCarbs, formatDoseCompact } from '../../domain/dose/index.ts'
import { ratioChangeTexts, ratioExampleText, ratioSavedText } from './ratio.ts'

const NBSP = '\u00a0'

describe('ratioExampleText', () => {
  it.each([
    [15, `Con este ratio, 60 g de HC dan 4${NBSP}unidades.`],
    [12, `Con este ratio, 60 g de HC dan 5${NBSP}unidades.`],
    [14, `Con este ratio, 60 g de HC dan 4,29${NBSP}unidades.`],
    [12.5, `Con este ratio, 60 g de HC dan 4,8${NBSP}unidades.`],
    [60, `Con este ratio, 60 g de HC dan 1${NBSP}unidad.`],
    [120, `Con este ratio, 60 g de HC dan 0,5${NBSP}unidades.`],
    [1.5, `Con este ratio, 60 g de HC dan 40${NBSP}unidades.`],
    [0.5, `Con este ratio, 60 g de HC dan 120${NBSP}unidades.`],
    // 60 ÷ 59,9 = 1,0016…: shown as "1", in singular.
    [59.9, `Con este ratio, 60 g de HC dan 1${NBSP}unidad.`],
    // 60 ÷ 7 = 8,571…: rounded half up only when shown.
    [7, `Con este ratio, 60 g de HC dan 8,57${NBSP}unidades.`],
  ])('ratio %s → %j', (ratio, text) => {
    expect(ratioExampleText(ratio)).toBe(text)
  })

  it('the dose of the example is the one of the domain, without trailing zeros', () => {
    for (const ratio of [1, 3, 7.125, 10, 15, 22.5, 1000]) {
      const dose = doseForCarbs(60, ratio)
      if (dose === null) throw new Error('expected a dose')
      expect(ratioExampleText(ratio)).toBe(
        `Con este ratio, 60 g de HC dan ${formatDoseCompact(dose)}${NBSP}unidades.`,
      )
    }
  })

  it('a ratio so big that the dose rounds to 0 still shows it', () => {
    expect(ratioExampleText(100_000)).toBe(
      `Con este ratio, 60 g de HC dan 0${NBSP}unidades.`,
    )
  })

  it.each([0, -15, NaN, Infinity, Number.MIN_VALUE])(
    'no example when the dose cannot be calculated (%s)',
    (ratio) => {
      expect(ratioExampleText(ratio)).toBeNull()
    },
  )
})

describe('ratioChangeTexts', () => {
  it('15 → 12: the question, and how the example changes', () => {
    expect(ratioChangeTexts(15, 12)).toEqual({
      question: '¿Cambiar el ratio de 15 a 12?',
      detail: `Desde ahora, 60 g de HC van a dar 5${NBSP}unidades en lugar de 4. Las comidas ya guardadas no cambian.`,
    })
  })

  it('the ratios go exact, with decimal comma', () => {
    expect(ratioChangeTexts(12.5, 1.5)).toEqual({
      question: '¿Cambiar el ratio de 12,5 a 1,5?',
      detail: `Desde ahora, 60 g de HC van a dar 40${NBSP}unidades en lugar de 4,8. Las comidas ya guardadas no cambian.`,
    })
  })

  it('a new dose of exactly 1 is in singular', () => {
    expect(ratioChangeTexts(15, 60).detail).toBe(
      `Desde ahora, 60 g de HC van a dar 1${NBSP}unidad en lugar de 4. Las comidas ya guardadas no cambian.`,
    )
  })

  it('two ratios whose example shows the same number: only that meals do not change', () => {
    expect(ratioChangeTexts(15, 15.0001)).toEqual({
      question: '¿Cambiar el ratio de 15 a 15,0001?',
      detail: 'Las comidas ya guardadas no cambian.',
    })
  })

  it('a new ratio whose example cannot be calculated: only that meals do not change', () => {
    expect(ratioChangeTexts(15, Number.MIN_VALUE).detail).toBe(
      'Las comidas ya guardadas no cambian.',
    )
  })
})

describe('ratioSavedText', () => {
  it.each([
    [12, 'Ratio guardado: 1 unidad cada 12 g de HC.'],
    [12.5, 'Ratio guardado: 1 unidad cada 12,5 g de HC.'],
    [1500, 'Ratio guardado: 1 unidad cada 1.500 g de HC.'],
  ])('%s → %j', (ratio, text) => {
    expect(ratioSavedText(ratio)).toBe(text)
  })
})
