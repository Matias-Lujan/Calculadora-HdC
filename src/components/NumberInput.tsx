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
  /**
   * Extra classes for the <input>, that do not change the ones of the field
   * (size, border, colors): for example, the letter of a dose.
   */
  className?: string
  /**
   * The unit, written inside the field on its right ("g", "g cocidos",
   * "unidades"). Only seen: the label of the field has to say it for
   * screen readers.
   */
  suffix?: string
  /** Classes for the box of the field and its suffix: its width. */
  boxClassName?: string
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
 *
 * When it gets the focus with a value, the whole text is selected, so the
 * first key replaces it (UX-15); a second tap places the caret as usual.
 */
export function NumberInput({
  id,
  name,
  value,
  onValueChange,
  onBlur,
  invalid,
  describedBy,
  className,
  suffix,
  boxClassName,
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

    // Select everything on focus (UX-15). Safari, also on iOS, places the
    // caret where the finger landed after the focus event, so the selection
    // is made again once the tap is done (setTimeout 0); and the mouseup of
    // that same tap is cancelled, because desktop browsers collapse the
    // selection there. Only the tap that gives the focus: a second tap
    // places the caret.
    let tapGivesFocus = false
    let selectTimer: number | undefined
    const selectAll = () => {
      if (document.activeElement === input && input.value !== '') {
        input.setSelectionRange(0, input.value.length)
      }
    }
    const handlePointerDown = () => {
      tapGivesFocus = document.activeElement !== input
    }
    const handleFocus = () => {
      selectAll()
      window.clearTimeout(selectTimer)
      selectTimer = window.setTimeout(selectAll, 0)
    }
    const handleMouseUp = (event: MouseEvent) => {
      if (!tapGivesFocus) return
      tapGivesFocus = false
      event.preventDefault()
    }

    input.addEventListener('beforeinput', handleBeforeInput)
    input.addEventListener('paste', handlePaste)
    input.addEventListener('input', handleInput)
    input.addEventListener('pointerdown', handlePointerDown)
    input.addEventListener('focus', handleFocus)
    input.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.clearTimeout(selectTimer)
      input.removeEventListener('beforeinput', handleBeforeInput)
      input.removeEventListener('paste', handlePaste)
      input.removeEventListener('input', handleInput)
      input.removeEventListener('pointerdown', handlePointerDown)
      input.removeEventListener('focus', handleFocus)
      input.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Room on the right for the suffix: about half a letter of the field per
  // letter of the suffix (it is smaller), plus its margin. In em, so it
  // grows with the letter of the iPhone (UX-27).
  const suffixRoom =
    suffix === undefined
      ? undefined
      : { paddingRight: `calc(${suffix.length * 0.5}em + 1rem)` }
  const input = (
    <input
      ref={inputRef}
      id={id}
      name={name}
      style={suffixRoom}
      className={`${field} tabular-nums${className === undefined ? '' : ` ${className}`}`}
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
  )

  return (
    <>
      {suffix === undefined && boxClassName === undefined ? (
        input
      ) : (
        <div
          // h-fit: as tall as the field, never stretched by a grid or flex
          // row, so the suffix stays centered on the number.
          className={`relative h-fit${boxClassName === undefined ? '' : ` ${boxClassName}`}`}
        >
          {input}
          {suffix !== undefined && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-soft"
            >
              {suffix}
            </span>
          )}
        </div>
      )}
      <p aria-live="polite" className="text-sm text-ink-soft">
        {notice !== null && typedNumberNoticeMessage(notice)}
      </p>
    </>
  )
}
