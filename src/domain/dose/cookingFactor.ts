import type { FoodState } from './types.ts'

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

/**
 * Whether a food is eaten cooked but its cooking factor is not loaded yet,
 * so it cannot be used in a meal (spec §6.4, §6.5): the same criterion as
 * MISSING_COOKING_FACTOR in calculateMeal (§8.4). A factor that is loaded but
 * not valid (0, negative) does not count as missing: the calculation reports
 * it as INVALID_COOKING_FACTOR.
 */
export function needsCookingFactor(
  state: FoodState,
  cookingFactor: number | null,
): boolean {
  return state === 'raw_cooked' && cookingFactor === null
}
