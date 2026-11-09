/** "12", "12,5", "1234,5": decimal comma, no thousands separator. */
const DECIMAL_COMMA = /^\d+(?:,\d+)?$/

/** "1.234,5": dot thousands separator. Only valid together with a comma. */
const THOUSANDS_DOT_DECIMAL_COMMA = /^\d{1,3}(?:\.\d{3})+,\d+$/

/**
 * "12.5", "0.25", "1.2345": dot as decimal separator. A dot followed by
 * exactly 3 digits ("1.234") is excluded: it could also be a thousands
 * separator, so it is ambiguous.
 */
const DECIMAL_DOT = /^\d+\.(?:\d{1,2}|\d{4,})$/

/** Unit suffix printed next to the number: "12,5 g", "30gr", "30 grs." */
const GRAMS_SUFFIX = /\s*(?:g|gr|grs)\.?$/i

/**
 * Turns a number transcribed from a nutrition label into a number (spec §9.7).
 *
 * Returns `null` whenever the text is not a plain, unambiguous number, so the
 * confirmation screen leaves the field empty for the user to fill in:
 * - empty or non-numeric text ("", "-", "no aporta cantidades significativas");
 * - bounds instead of values ("<0,5", "≤ 1", "menos de 0,5"): the app does not
 *   pick a value for the user;
 * - ambiguous separators ("1.234": one thousand two hundred thirty-four, or
 *   one point two three four?);
 * - negative numbers, percentages or anything else.
 *
 * "0" is a plain number and gives 0.
 */
export function parseLabelNumber(text: string | null): number | null {
  if (text === null) return null

  const trimmed = text.trim().replace(GRAMS_SUFFIX, '')

  if (DECIMAL_COMMA.test(trimmed)) {
    return Number(trimmed.replace(',', '.'))
  }
  if (THOUSANDS_DOT_DECIMAL_COMMA.test(trimmed)) {
    return Number(trimmed.replaceAll('.', '').replace(',', '.'))
  }
  if (DECIMAL_DOT.test(trimmed)) {
    return Number(trimmed)
  }
  return null
}
