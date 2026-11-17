/**
 * The carbs of several meals added up, for example the total of a day in
 * the history (spec §6.7). Never rounds: round only for display
 * (formatCarbs). Returns null if a value is not a finite number or is
 * negative, or if the sum overflows: a result is always a finite number.
 * An empty list gives 0. The input is not mutated.
 */
export function sumCarbs(values: readonly number[]): number | null {
  let total = 0
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) return null
    total += value
  }
  return Number.isFinite(total) ? total : null
}
