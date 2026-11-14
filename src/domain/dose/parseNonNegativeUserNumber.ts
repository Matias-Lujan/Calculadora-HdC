import type { PositiveNumberError } from './parsePositiveUserNumber.ts'
import { parseUserNumber } from './parseUserNumber.ts'

/**
 * Why a field that needs a number >= 0 is not valid: the same codes as
 * `PositiveNumberError`, without `NOT_POSITIVE` (0 is valid). The text shown
 * to the user lives in `src/lib/errors.ts`.
 */
export type NonNegativeNumberError = Exclude<
  PositiveNumberError,
  'NOT_POSITIVE'
>

export type NonNegativeNumberResult =
  { value: number } | { error: NonNegativeNumberError }

/**
 * Turns the text of a required field that takes a number >= 0 (the applied
 * dose of a meal, spec §6.6) into that number, or tells why it can't. 0 is
 * valid, there is no upper limit, and nothing is rounded. Signs are already
 * rejected by `parseUserNumber`.
 */
export function parseNonNegativeUserNumber(
  text: string,
): NonNegativeNumberResult {
  if (text.trim() === '') return { error: 'REQUIRED' }
  const value = parseUserNumber(text)
  if (value === null) return { error: 'INVALID_NUMBER' }
  return { value }
}
