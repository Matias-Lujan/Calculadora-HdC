import { parseUserNumber } from './parseUserNumber.ts'

/**
 * Why a field that needs a number > 0 is not valid. They are codes: the text
 * shown to the user lives in `src/lib/errors.ts`.
 * - `REQUIRED`: the field is empty (or only has spaces).
 * - `INVALID_NUMBER`: the text is not a number for `parseUserNumber`
 *   (incomplete, a dot as decimal separator, etc.).
 * - `NOT_POSITIVE`: the number is 0.
 */
export type PositiveNumberError = 'REQUIRED' | 'INVALID_NUMBER' | 'NOT_POSITIVE'

export type PositiveNumberResult =
  { value: number } | { error: PositiveNumberError }

/**
 * Turns the text of a required field that needs a number > 0 (the ratio and
 * the thresholds, spec §6.8) into that number, or tells why it can't. There
 * is no upper limit, and nothing is rounded.
 */
export function parsePositiveUserNumber(text: string): PositiveNumberResult {
  if (text.trim() === '') return { error: 'REQUIRED' }
  const value = parseUserNumber(text)
  if (value === null) return { error: 'INVALID_NUMBER' }
  if (value <= 0) return { error: 'NOT_POSITIVE' }
  return { value }
}
