import {
  doseForCarbs,
  formatDoseCompact,
  formatUserNumber,
  withUnitsWord,
} from '../../domain/dose/index.ts'

// The texts that show what a ratio means (spec §6.8): the example under the
// field, the confirmation to change it and the notice once saved. They do
// no math of their own: the dose of the example is calculated by
// src/domain/dose (doseForCarbs, the same division as a meal).

/** The carbs of the example. */
const EXAMPLE_CARBS_G = 60

/**
 * How many units the example carbs give with a ratio, without trailing
 * zeros ("4", "4,29", "0,5"), or null if it cannot be calculated.
 */
function exampleDose(carbRatioGPerUnit: number): string | null {
  const dose = doseForCarbs(EXAMPLE_CARBS_G, carbRatioGPerUnit)
  return dose === null ? null : formatDoseCompact(dose)
}

/**
 * Under the ratio while a valid one is typed: "Con este ratio, 60 g de HC
 * dan 4 unidades.". null if the dose cannot be calculated (a ratio so small
 * that it overflows): then there is no example.
 */
export function ratioExampleText(carbRatioGPerUnit: number): string | null {
  const dose = exampleDose(carbRatioGPerUnit)
  if (dose === null) return null
  return `Con este ratio, ${EXAMPLE_CARBS_G} g de HC dan ${withUnitsWord(dose)}.`
}

/**
 * The confirmation before saving a new ratio: "¿Cambiar el ratio de 15 a
 * 12?" and "Desde ahora, 60 g de HC van a dar 5 unidades en lugar de 4. Las
 * comidas ya guardadas no cambian.". The ratios go exact. Without the
 * sentence of the example if a dose cannot be calculated or both show the
 * same number.
 */
export function ratioChangeTexts(
  from: number,
  to: number,
): { question: string; detail: string } {
  const question = `¿Cambiar el ratio de ${formatUserNumber(from)} a ${formatUserNumber(to)}?`
  const kept = 'Las comidas ya guardadas no cambian.'
  const before = exampleDose(from)
  const after = exampleDose(to)
  if (before === null || after === null || before === after) {
    return { question, detail: kept }
  }
  return {
    question,
    detail: `Desde ahora, ${EXAMPLE_CARBS_G} g de HC van a dar ${withUnitsWord(after)} en lugar de ${before}. ${kept}`,
  }
}

/** The notice once a new ratio is saved: "Ratio guardado: 1 unidad cada 12 g de HC.". */
export function ratioSavedText(carbRatioGPerUnit: number): string {
  return `Ratio guardado: 1 unidad cada ${formatUserNumber(carbRatioGPerUnit)} g de HC.`
}
