import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  applyTypedEdit,
  type TypedEditResult,
  type TypedNumberNotice,
} from '../domain/dose/index.ts'
import { typedNumberNoticeMessage } from '../lib/errors.ts'
import {
  beforeInputAction,
  deletionEdit,
  pasteEdit,
} from './numberInputEdit.ts'
import { field } from './styles.ts'

type NumberInputProps = {
  id: string
  name: string
  /** The field text, as applyTypedEdit leaves it (spec §8.7). */
  value: string
  onValueChange: (value: string) => void
  onBlur: () => void
  invalid: boolean
  describedBy?: string
}

/**
 * Number field with decimal comma (spec §8.7). Every edit goes through
 * applyTypedEdit, which puts the thousands dots and returns where the caret
 * goes.
 *
 * The <input> is uncontrolled: the edits are written to the DOM by hand
 * (value and caret), and a controlled value would make React fight them and
 * move the caret. The listeners are native, because React's onBeforeInput is
 * not the native beforeinput and has no inputType (React issue #11211).
 */
export function NumberInput({
  id,
  name,
  value,
  onValueChange,
  onBlur,
  invalid,
  describedBy,
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // The last text this component accepted: what the field had before the
  // browser applied a native edit (deletions).
  const lastValueRef = useRef(value)
  const onValueChangeRef = useRef(onValueChange)
  const [notice, setNotice] = useState<TypedNumberNotice | null>(null)

  useLayoutEffect(() => {
    onValueChangeRef.current = onValueChange
  })

  // A value set from outside (not typed here) goes to the DOM.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (input !== null && input.value !== value) {
      input.value = value
      lastValueRef.current = value
    }
  }, [value])

  useEffect(() => {
    const input = inputRef.current
    if (input === null) return

    const commit = (result: TypedEditResult) => {
      input.value = result.value
      input.setSelectionRange(result.caret, result.caret)
      const changed = result.value !== lastValueRef.current
      lastValueRef.current = result.value
      setNotice(result.notice)
      if (changed) onValueChangeRef.current(result.value)
    }

    const handleBeforeInput = (event: InputEvent) => {
      const action = beforeInputAction({
        inputType: event.inputType,
        data: event.data,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
      })
      switch (action.kind) {
        case 'apply':
          event.preventDefault()
          commit(applyTypedEdit(input.value, action.edit))
          return
        case 'native':
          return
        case 'reject':
          event.preventDefault()
          setNotice('REJECTED')
          return
        case 'ignore':
          event.preventDefault()
          return
      }
    }

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault()
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const edit = pasteEdit(text, input.selectionStart, input.selectionEnd)
      if (edit !== null) commit(applyTypedEdit(input.value, edit))
    }

    // Only reached by edits that were not cancelled: deletions, and anything
    // the browser did not let us cancel (composition, autofill).
    const handleInput = (event: Event) => {
      const previous = lastValueRef.current
      if (input.value === previous) return
      const inputType = event instanceof InputEvent ? event.inputType : ''
      const edit = inputType.startsWith('delete')
        ? deletionEdit(previous, input.value, input.selectionStart)
        : null
      if (edit !== null) {
        commit(applyTypedEdit(previous, edit))
      } else {
        commit({ value: previous, caret: previous.length, notice: 'REJECTED' })
      }
    }

    input.addEventListener('beforeinput', handleBeforeInput)
    input.addEventListener('paste', handlePaste)
    input.addEventListener('input', handleInput)
    return () => {
      input.removeEventListener('beforeinput', handleBeforeInput)
      input.removeEventListener('paste', handlePaste)
      input.removeEventListener('input', handleInput)
    }
  }, [])

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        name={name}
        className={`${field} tabular-nums`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        defaultValue={value}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onBlur={() => {
          setNotice(null)
          onBlur()
        }}
      />
      <p aria-live="polite" className="text-sm text-ink-soft">
        {notice !== null && typedNumberNoticeMessage(notice)}
      </p>
    </>
  )
}
