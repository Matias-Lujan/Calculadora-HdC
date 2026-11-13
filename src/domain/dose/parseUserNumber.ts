/**
 * A number typed by the user (spec §8.7): an integer part, either plain
 * digits ("1500") or correctly grouped with "." ("1.500"), and an optional
 * decimal part, a comma followed by at least one digit ("12,5"). Nothing is
 * filled in: ",5" and "12," are not numbers.
 */
const USER_NUMBER = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/

/**
 * Turns the text of a number field into a number (spec §8.7).
 *
 * Returns `null` for empty, incomplete or invalid text: a missing integer or
 * decimal part (",5", "12,"), a dot as decimal separator ("12.5"), badly
 * grouped thousands ("1.50"), signs, units, inner spaces, exponents, etc.
 *
 * The result is not rounded, and its range is not checked here: whoever uses
 * the value validates it (a quantity must be > 0, for example).
 */
export function parseUserNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!USER_NUMBER.test(trimmed)) return null

  const value = Number(trimmed.replaceAll('.', '').replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
