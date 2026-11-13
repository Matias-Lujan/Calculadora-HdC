import { applyTypedEdit } from './applyTypedEdit.ts'

/**
 * Writes `String(value)` without an exponent: "1e-7" → "0.0000001",
 * "1.5e+21" → "1500000000000000000000". `String` only uses an exponent below
 * 1e-6 (exponent -7 or less) and from 1e21 on (exponent 21 or more, more
 * than the at most 17 significant digits), always with one digit before the
 * dot. So the dot ends up either before all the digits or after all of
 * them. Its digits are already the shortest ones that round-trip, so moving
 * the dot keeps the value exact.
 */
function plainDecimal(value: number): string {
  const text = String(value)
  const match = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(text)
  if (match === null) return text

  const [, integerDigit = '', fraction = '', exponentText = '0'] = match
  const digits = integerDigit + fraction
  const exponent = Number(exponentText)
  if (exponent < 0) return `0.${'0'.repeat(-exponent - 1)}${digits}`
  return digits + '0'.repeat(exponent - fraction.length)
}

/**
 * Writes a number the way the number fields show it (spec §8.7): the inverse
 * of `parseUserNumber`, so `parseUserNumber(formatUserNumber(x)) === x`.
 * Decimal comma, thousands grouped with "." and nothing rounded: every digit
 * of the value stays ("12,5", "1.500", "0,30000000000000004").
 *
 * Used to fill a field with a saved value, and to show a value the user
 * typed that is not a result (for example, the weight per unit of a food).
 * Not for showing results: carbs and doses are shown rounded, with
 * `formatCarbs` and `formatDose`.
 *
 * Returns "" for values a field cannot hold (NaN, infinite or negative).
 */
export function formatUserNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return ''

  // Only digits and at most one comma: applyTypedEdit takes it as typed and
  // returns its canonical form, the same one the field would show.
  const inserted = plainDecimal(value).replace('.', ',')
  return applyTypedEdit('', { start: 0, end: 0, inserted }).value
}
