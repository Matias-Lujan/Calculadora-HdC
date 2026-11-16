import { parseLabelNumber } from './parseLabelNumber.ts'

/** A number right before "kcal", at the start or after a separator. */
const KCAL = /(?:^|[\s=(/:;])(\d[\d.,]*)\s*kcal/gi

/** Bounds instead of values: "<4 kcal", "≤ 4 kcal", "menos de 4 kcal". */
const BOUND = /<|≤|menos/i

/**
 * The kilocalories of the energy row of a label, as transcribed (spec
 * §9.7): "107 kcal", "107 kcal = 449 kJ", "449 kJ = 107 kcal", "107 kcal
 * (449 kJ)" give 107. The number goes through parseLabelNumber, so it
 * follows the same rules ("1.234 kcal" is ambiguous).
 *
 * null when there is no single number before "kcal": empty text, only kJ
 * ("449 kJ"), no unit ("107"), two values ("107 kcal / 120 kcal"), a bound
 * ("<4 kcal") or a number that is not plain. Without a value, there is no
 * check.
 */
export function parseLabelEnergyKcal(text: string | null): number | null {
  if (text === null || text.trim() === '') return null
  if (BOUND.test(text)) return null
  const matches = [...text.matchAll(KCAL)]
  const [only, ...rest] = matches
  if (only === undefined || rest.length > 0) return null
  return parseLabelNumber(only[1] ?? null)
}

export type LabelEnergyInput = {
  /** The carbs of the column, as typed, in grams. */
  carbsG: number | null
  /** The fiber typed for that column (null = none). */
  fiberG: number | null
  /** The kilocalories of the same column (parseLabelEnergyKcal). */
  energyKcal: number | null
}

/**
 * Whether the carbs alone give more energy than the label says for the
 * same column (spec §9.7): a sign of a misread number, such as a lost
 * decimal comma ("30" instead of "3,0").
 *
 * `(carbs − fiber) × 4 > kcal × 1,05 + 4`, without rounding:
 * - 4 kcal per gram of carbs (Res. GMC 46/03, 3.3.1);
 * - + 4 kcal because the label rounds the energy and the carbs;
 * - × 1,05 because imported labels can use specific factors.
 *
 * false when any input is missing, not finite or negative, or the fiber is
 * more than the carbs: then there is nothing to compare.
 */
export function carbsExceedLabelEnergy({
  carbsG,
  fiberG,
  energyKcal,
}: LabelEnergyInput): boolean {
  if (!isNonNegative(carbsG) || !isNonNegative(energyKcal)) return false
  if (fiberG !== null && !isNonNegative(fiberG)) return false
  const fiber = fiberG ?? 0
  if (fiber > carbsG) return false
  return (carbsG - fiber) * 4 > energyKcal * 1.05 + 4
}

function isNonNegative(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0
}
