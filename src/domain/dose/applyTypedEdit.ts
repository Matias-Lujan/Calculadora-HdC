import { parseUserNumber } from './parseUserNumber.ts'

/**
 * One edit of a number field (spec §8.7): the range [start, end) of the
 * previous text that is replaced (empty when nothing was selected) and the
 * text that comes in ("" when deleting).
 */
export type TypedEdit = {
  start: number
  end: number
  inserted: string
}

/**
 * Why an edit was not taken as typed. They are codes: the text shown to the
 * user lives in `src/lib/errors.ts`.
 * - `DECIMAL_DOT`: a "." was typed. It became the decimal comma, or was
 *   rejected if there already was one. The UI tells the user decimals go with
 *   a comma.
 * - `REJECTED`: the edit did not fit and the field kept its previous text.
 */
export type TypedNumberNotice = 'DECIMAL_DOT' | 'REJECTED'

/** What the field shows after an edit, where the caret goes, and why. */
export type TypedEditResult = {
  value: string
  caret: number
  notice: TypedNumberNotice | null
}

/**
 * The canonical form of a field text that only has digits, dots and at most
 * one comma. Every dot in it is a thousands dot (the app puts them), so they
 * are all dropped; the integer part loses its leading zeros (one "0" stays if
 * it was all zeros) and is grouped with "." every 3 digits from the right; the
 * comma and the decimal digits stay as they are. Nothing is added: "," stays
 * ",", ",5" stays ",5" and "12," stays "12,".
 */
function canonical(text: string): string {
  const plain = text.replaceAll('.', '')
  const commaIndex = plain.indexOf(',')
  const integerPart = commaIndex === -1 ? plain : plain.slice(0, commaIndex)
  const rest = commaIndex === -1 ? '' : plain.slice(commaIndex)
  const digits = integerPart.replace(/^0+(?=\d)/, '')
  return digits.replace(/\B(?=(?:\d{3})+$)/g, '.') + rest
}

/**
 * The canonical form of `left + right`, with the caret where `left` ends: the
 * same digits and commas stay before it (thousands dots do not count, and
 * neither do the leading zeros that the canonical form drops). If that place
 * is right before a thousands dot, the caret goes before the dot.
 */
function accept(left: string, right: string): TypedEditResult {
  const plainLeft = left.replaceAll('.', '')
  const plain = plainLeft + right.replaceAll('.', '')
  const droppedZeros = /^0+(?=\d)/.exec(plain)?.[0].length ?? 0
  const before = plainLeft.length - Math.min(droppedZeros, plainLeft.length)

  const value = canonical(plain)
  let caret = 0
  let counted = 0
  while (counted < before) {
    if (value[caret] !== '.') counted++
    caret++
  }
  return { value, caret, notice: null }
}

function isValidRange(previous: string, { start, end }: TypedEdit): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start <= end &&
    end <= previous.length
  )
}

/**
 * Applies one edit to a number field (spec §8.7) and returns the text to
 * show, the caret position in it and, if the edit was not taken as typed,
 * why. The app does not guess: it only adds and moves the thousands dots,
 * and an edit that does not fit is rejected (the field keeps `previous`,
 * with the caret at the end of the replaced range):
 * - characters other than ASCII digits, "." and "," (`REJECTED`);
 * - a typed "." (`inserted` is exactly "."): it becomes the decimal comma, or
 *   is rejected if the rest of the field already has a comma (`DECIMAL_DOT`
 *   in both cases);
 * - any other text with a "." (a paste), unless it is a valid number pasted
 *   into an empty field (`REJECTED`);
 * - a second comma (`REJECTED`).
 *
 * Dots outside the edit come from `previous`, so they are thousands dots: the
 * app drops them and groups again. An invalid range is rejected.
 *
 * It does not round or convert to a number: use `parseUserNumber` for that.
 */
export function applyTypedEdit(
  previous: string,
  edit: TypedEdit,
): TypedEditResult {
  if (!isValidRange(previous, edit)) {
    return { value: previous, caret: previous.length, notice: 'REJECTED' }
  }
  const { start, end, inserted } = edit
  const rejected = (notice: TypedNumberNotice): TypedEditResult => ({
    value: previous,
    caret: end,
    notice,
  })

  if (/[^0-9.,]/.test(inserted)) return rejected('REJECTED')

  const left = previous.slice(0, start)
  const right = previous.slice(end)
  const remaining = left + right

  if (inserted === '.') {
    if (remaining.includes(',')) return rejected('DECIMAL_DOT')
    return { ...accept(`${left},`, right), notice: 'DECIMAL_DOT' }
  }

  if (inserted.includes('.')) {
    if (remaining.trim() === '' && parseUserNumber(inserted) !== null) {
      return accept(inserted, '')
    }
    return rejected('REJECTED')
  }

  const commas = inserted.split(',').length - 1
  if (commas > 1 || (commas === 1 && remaining.includes(','))) {
    return rejected('REJECTED')
  }

  return accept(left + inserted, right)
}
