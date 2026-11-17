/**
 * The bolus dose for some carbs (spec §8.2): carbs ÷ ratio, exact and never
 * rounded (round only for display). It is the division calculateMeal uses
 * for the meal, and the one for any other dose the app shows, such as the
 * example of the ratio in Configuración (spec §6.8).
 *
 * Returns null if the carbs are not a finite number >= 0, the ratio is not a
 * finite number > 0, or the dose overflows (a tiny ratio): a result is
 * always a finite number.
 */
export function doseForCarbs(
  carbsG: number,
  carbRatioGPerUnit: number,
): number | null {
  if (!Number.isFinite(carbsG) || carbsG < 0) return null
  if (!Number.isFinite(carbRatioGPerUnit) || carbRatioGPerUnit <= 0) {
    return null
  }
  const dose = carbsG / carbRatioGPerUnit
  return Number.isFinite(dose) ? dose : null
}
