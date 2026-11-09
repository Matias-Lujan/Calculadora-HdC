/**
 * Rounds half up, using the decimal representation of the number instead of
 * its binary one. `(1.005).toFixed(2)` gives "1.00" because 1.005 is stored
 * as 1.00499999…; this gives 1.01, which is what a person expects.
 * Values shown by the app are never negative.
 */
function roundHalfUp(value: number, decimals: number): number {
  return shiftDecimal(Math.round(shiftDecimal(value, decimals)), -decimals)
}

/** Multiplies by 10^places by moving the decimal exponent of the string form. */
function shiftDecimal(value: number, places: number): number {
  const [mantissa, exponent = '0'] = String(value).split('e')
  return Number(`${mantissa}e${Number(exponent) + places}`)
}

function formatFixed(value: number, decimals: number): string {
  return roundHalfUp(value, decimals).toFixed(decimals).replace('.', ',')
}

/** Carbs for display: 1 decimal, decimal comma (128.24 → "128,2"). */
export function formatCarbs(grams: number): string {
  return formatFixed(grams, 1)
}

/** Dose for display: 2 decimals, decimal comma (8.5493 → "8,55"). */
export function formatDose(units: number): string {
  return formatFixed(units, 2)
}
