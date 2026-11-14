const USUAL_COOKING_FACTOR_MIN = 1
const USUAL_COOKING_FACTOR_MAX = 4

function isPositiveFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0
}

/**
 * Measured cooking factor: cooked weight ÷ raw weight (spec §6.4). Never
 * rounds. Returns `null` when a weight is missing, not finite or not > 0, or
 * when the quotient is not finite or not > 0 (overflow or underflow). A cooked
 * weight lower than the raw weight is valid.
 */
export function cookingFactorFromWeights(
  rawWeightG: number | null,
  cookedWeightG: number | null,
): number | null {
  if (!isPositiveFinite(rawWeightG) || !isPositiveFinite(cookedWeightG)) {
    return null
  }
  const factor = cookedWeightG / rawWeightG
  return isPositiveFinite(factor) ? factor : null
}

/**
 * Whether a cooking factor is outside the usual 1–4 range (spec §6.4 and
 * §8.5). The bounds 1 and 4 are usual and do not warn.
 */
export function isCookingFactorUnusual(factor: number): boolean {
  return factor < USUAL_COOKING_FACTOR_MIN || factor > USUAL_COOKING_FACTOR_MAX
}
