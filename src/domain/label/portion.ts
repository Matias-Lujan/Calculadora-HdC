export type PortionConversionError =
  'INVALID_PORTION_SIZE' | 'INVALID_CARBS' | 'CARBS_EXCEED_PORTION'

export type PortionConversion =
  | { ok: true; carbsPer100g: number }
  | { ok: false; error: PortionConversionError }

/**
 * Converts the carbs of one portion into carbs per 100 g, for labels that
 * only print per-portion values (spec §6.1):
 * carbs per 100 g = carbs per portion ÷ portion grams × 100.
 *
 * `null` inputs (fields left empty) are invalid. When both inputs are
 * invalid, the portion size error is reported. The result is never rounded.
 */
export function carbsPer100gFromPortion(
  carbsPerPortionG: number | null,
  portionSizeG: number | null,
): PortionConversion {
  if (
    portionSizeG === null ||
    !Number.isFinite(portionSizeG) ||
    portionSizeG <= 0
  ) {
    return { ok: false, error: 'INVALID_PORTION_SIZE' }
  }
  if (
    carbsPerPortionG === null ||
    !Number.isFinite(carbsPerPortionG) ||
    carbsPerPortionG < 0
  ) {
    return { ok: false, error: 'INVALID_CARBS' }
  }
  // More grams of carbs than grams of food: a misread value.
  if (carbsPerPortionG > portionSizeG) {
    return { ok: false, error: 'CARBS_EXCEED_PORTION' }
  }
  return { ok: true, carbsPer100g: (carbsPerPortionG / portionSizeG) * 100 }
}
