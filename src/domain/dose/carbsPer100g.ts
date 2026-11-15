import { parseUserNumber } from './parseUserNumber.ts'

/** Upper bound of carbs per 100 g: more than 100 g in 100 g is impossible. */
export const MAX_CARBS_PER_100G = 100

/**
 * Whether a carbs-per-100-g value is valid: finite and between 0 and 100,
 * both included (same rule as `INVALID_CARBS`, spec §8.4, and the CHECK of
 * `foods.carbs_per_100g`). 0 is valid: a food without carbs.
 */
export function isValidCarbsPer100g(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_CARBS_PER_100G
}

/**
 * Why the text of the carbs-per-100-g field is not valid. They are codes:
 * the text shown to the user lives in `src/lib/errors.ts`.
 * - `REQUIRED`: the field is empty (or only has spaces).
 * - `INVALID_NUMBER`: the text is not a number for `parseUserNumber`.
 * - `ABOVE_100`: the number is more than 100.
 */
export type CarbsPer100gError = 'REQUIRED' | 'INVALID_NUMBER' | 'ABOVE_100'

export type CarbsPer100gResult =
  { value: number } | { error: CarbsPer100gError }

/**
 * Turns the text of the carbs-per-100-g field of a food into that number, or
 * tells why it can't. 0 is valid. Nothing is rounded.
 */
export function parseCarbsPer100g(text: string): CarbsPer100gResult {
  if (text.trim() === '') return { error: 'REQUIRED' }
  const value = parseUserNumber(text)
  if (value === null) return { error: 'INVALID_NUMBER' }
  // parseUserNumber never returns a negative number, so the only way out of
  // the range is above 100.
  if (!isValidCarbsPer100g(value)) return { error: 'ABOVE_100' }
  return { value }
}

/**
 * Available carbs per 100 g from the total carbs and the fiber of a
 * reference table (spec §5.2, §14 #50): `total − fiber`, not rounded (the
 * binary noise of the subtraction, like 28.17 − 0.4 = 27.770000000000003, is kept). Null
 * if either value is not finite or is negative, if the total is more than
 * 100 (impossible in 100 g) or if the fiber is more than the total.
 */
export function carbsWithoutFiber(
  totalCarbsPer100g: number,
  fiberPer100g: number,
): number | null {
  if (!isValidCarbsPer100g(totalCarbsPer100g)) return null
  if (!Number.isFinite(fiberPer100g) || fiberPer100g < 0) return null
  if (fiberPer100g > totalCarbsPer100g) return null
  const carbs = totalCarbsPer100g - fiberPer100g
  // Always true with the checks above; kept as a guard for the range.
  return isValidCarbsPer100g(carbs) ? carbs : null
}
