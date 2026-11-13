import type { TypedEdit } from '../domain/dose/index.ts'

// Plain functions behind NumberInput (spec §8.7): they turn the values of the
// native events into the exact edit that applyTypedEdit needs. They take
// plain values, not DOM objects, so they are tested without a browser.

/** What NumberInput does with a `beforeinput` event. */
export type BeforeInputAction =
  /** Cancel the native edit and apply this one with applyTypedEdit. */
  | { kind: 'apply'; edit: TypedEdit }
  /** Let the browser do it; the `input` event rebuilds it (deletions). */
  | { kind: 'native' }
  /** Cancel it and tell the user it did not go in. */
  | { kind: 'reject' }
  /** Cancel it without a notice (undo, redo, line breaks, formatting). */
  | { kind: 'ignore' }

export type BeforeInputValues = {
  inputType: string
  data: string | null
  selectionStart: number | null
  selectionEnd: number | null
}

/** Insertions whose text comes in `data` and replaces the selection. */
const TYPED_INPUT_TYPES = new Set([
  'insertText',
  'insertFromDictation',
  'insertFromPaste',
])

/**
 * Insertions that replace a range the browser chooses. In an <input>,
 * getTargetRanges() is always empty, so that range is unknown.
 */
const UNKNOWN_RANGE_INPUT_TYPES = new Set([
  'insertReplacementText',
  'insertFromDrop',
  'insertFromYank',
  'insertTranspose',
])

export function beforeInputAction({
  inputType,
  data,
  selectionStart,
  selectionEnd,
}: BeforeInputValues): BeforeInputAction {
  if (TYPED_INPUT_TYPES.has(inputType)) {
    if (data === null || selectionStart === null || selectionEnd === null) {
      return { kind: 'reject' }
    }
    return {
      kind: 'apply',
      edit: { start: selectionStart, end: selectionEnd, inserted: data },
    }
  }
  if (UNKNOWN_RANGE_INPUT_TYPES.has(inputType)) return { kind: 'reject' }
  if (inputType.startsWith('delete')) return { kind: 'native' }
  return { kind: 'ignore' }
}

/**
 * The edit of a `paste` event: the pasted text, as is (not trimmed), replaces
 * the selection. `null` if nothing was pasted or the selection is unknown.
 */
export function pasteEdit(
  text: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): TypedEdit | null {
  if (text === '' || selectionStart === null || selectionEnd === null) {
    return null
  }
  return { start: selectionStart, end: selectionEnd, inserted: text }
}

/**
 * Rebuilds a deletion the browser already did, from the text before
 * (`previous`), the text after (`next`) and the caret after it. A deletion
 * leaves the caret where the deleted range started, so the range is
 * [caret, caret + L), with L the number of deleted characters. Returns `null`
 * if that does not explain `next` (it was not a plain deletion).
 */
export function deletionEdit(
  previous: string,
  next: string,
  caret: number | null,
): TypedEdit | null {
  const deleted = previous.length - next.length
  if (deleted <= 0 || caret === null || !Number.isInteger(caret)) return null
  if (caret < 0 || caret + deleted > previous.length) return null
  if (previous.slice(0, caret) + previous.slice(caret + deleted) !== next) {
    return null
  }
  return { start: caret, end: caret + deleted, inserted: '' }
}
