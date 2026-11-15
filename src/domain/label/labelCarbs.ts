import { carbsPer100gFromPortion } from './portion.ts'

/** Whether the carbs of a label column are per 100 g or per portion. */
export type LabelCarbsBasis = 'per_100g' | 'per_portion'

export type LabelCarbsError =
  | 'INVALID_PORTION_SIZE'
  | 'INVALID_CARBS'
  | 'CARBS_EXCEED_PORTION'
  | 'INVALID_FIBER'
  | 'FIBER_EXCEEDS_CARBS'

export type LabelCarbsResult =
  { ok: true; carbsPer100g: number } | { ok: false; error: LabelCarbsError }

export type LabelCarbsInput = {
  basis: LabelCarbsBasis
  /** The carbs printed on the label, in the column's basis. */
  carbsG: number | null
  /** The portion in grams. Only used when the basis is per portion. */
  portionG: number | null
  /**
   * The fiber to subtract, in the same basis as the carbs (spec §5.3: a
   * label outside the Mercosur format can include it). null = none.
   */
  fiberG: number | null
}

/**
 * Carbs per 100 g of a food from its label (spec §6.1, §9.7), without fiber.
 *
 * Per portion: the carbs and the portion are checked as in
 * `carbsPer100gFromPortion` (the portion first), then the fiber, and the
 * result is `(carbs − fiber) ÷ portion × 100`.
 *
 * Per 100 g: the carbs have to be finite, ≥ 0 and at most 100 (more than
 * 100 g in 100 g is a misread value, `CARBS_EXCEED_PORTION`); the result is
 * `carbs − fiber`, without dividing and multiplying by 100 (57 ÷ 100 × 100
 * is 56.99999999999999 in binary). Without fiber, the carbs as they are.
 *
 * A null fiber counts as 0; it has to be finite, ≥ 0 and at most the
 * carbs. Nothing is rounded.
 */
export function labelCarbsPer100g({
  basis,
  carbsG,
  portionG,
  fiberG,
}: LabelCarbsInput): LabelCarbsResult {
  if (basis === 'per_portion') {
    const checked = carbsPer100gFromPortion(carbsG, portionG)
    if (!checked.ok) return checked
  }
  if (carbsG === null || !Number.isFinite(carbsG) || carbsG < 0) {
    return { ok: false, error: 'INVALID_CARBS' }
  }
  // More than 100 g in 100 g (per portion, already checked above).
  if (basis === 'per_100g' && carbsG > 100) {
    return { ok: false, error: 'CARBS_EXCEED_PORTION' }
  }

  const fiber = fiberG ?? 0
  if (!Number.isFinite(fiber) || fiber < 0) {
    return { ok: false, error: 'INVALID_FIBER' }
  }
  if (fiber > carbsG) return { ok: false, error: 'FIBER_EXCEEDS_CARBS' }

  if (basis === 'per_portion') {
    return carbsPer100gFromPortion(carbsG - fiber, portionG)
  }
  return { ok: true, carbsPer100g: fiberG === null ? carbsG : carbsG - fiber }
}
