/**
 * Significant digits a value is normalized to before showing it. A double
 * has 15 to 17; 15 drops the binary noise of a quotient or a subtraction
 * (100.35 / 100 is 1.0034999999999998, 28.17 − 0.4 is 27.770000000000003)
 * without touching any digit a person typed.
 */
const DISPLAY_SIGNIFICANT_DIGITS = 15

/**
 * The value at 15 significant digits, without binary noise: 27.770000000000003
 * gives 27.77 and 11.459999999999999 gives 11.46 (spec §14 #53). Only for
 * showing a value or filling a field with it, never for the calculation.
 * Values that are not finite are returned as they are.
 */
export function normalizeForDisplay(value: number): number {
  if (!Number.isFinite(value)) return value
  return Number(value.toPrecision(DISPLAY_SIGNIFICANT_DIGITS))
}
