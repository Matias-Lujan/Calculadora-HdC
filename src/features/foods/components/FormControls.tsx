import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { InfoTip } from '../../../components/InfoTip.tsx'
import {
  field,
  fieldLabel,
  segmented as segmentedStyles,
} from '../../../components/styles.ts'
import {
  foodFieldErrorMessage,
  type FoodFieldError,
} from '../../../lib/errors.ts'

// Small building blocks of the food form. No logic: they only lay out a
// label, a control and its error.

type FieldErrorProps = {
  id: string
  error: FoodFieldError | undefined
}

export function FieldError({ id, error }: FieldErrorProps) {
  if (error === undefined) return null
  return <FieldMessage id={id}>{foodFieldErrorMessage(error)}</FieldMessage>
}

type TextFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: FoodFieldError | undefined
  placeholder?: string
  multiline?: boolean
}

export function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  multiline = false,
}: TextFieldProps) {
  const errorId = `${id}-error`
  const invalid = error !== undefined
  const shared = {
    id,
    name: id,
    value,
    placeholder,
    onBlur,
    'aria-invalid': invalid,
    'aria-describedby': invalid ? errorId : undefined,
    className: field,
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      {multiline ? (
        <textarea
          {...shared}
          rows={3}
          className={`${shared.className} py-2`}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...shared}
          type="text"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldError id={errorId} error={error} />
    </div>
  )
}

type RadioGroupProps<T extends string> = {
  name: string
  legend: string
  /** Explanation behind an ⓘ next to the legend, if any. */
  info?: string
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
  error?: FoodFieldError | undefined
  /**
   * Two short options side by side (Sí/No), instead of one per line. Like
   * the radios, none is chosen until the user picks one.
   */
  segmented?: boolean
}

export function RadioGroup<T extends string>({
  name,
  legend,
  info,
  options,
  value,
  onChange,
  error,
  segmented = false,
}: RadioGroupProps<T>) {
  const errorId = `${name}-error`
  const legendId = `${name}-legend`
  const invalid = error !== undefined
  return (
    // Named with aria-labelledby instead of a <legend>, so the ⓘ can sit
    // next to the text without becoming part of the group's name.
    <fieldset
      className="flex flex-col gap-1"
      aria-labelledby={legendId}
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
    >
      <div className="flex min-h-11 flex-wrap items-center gap-x-1">
        <span id={legendId} className={fieldLabel}>
          {legend}
        </span>
        {info !== undefined && <InfoTip text={info} />}
      </div>
      <div
        className={segmented ? segmentedStyles.group : 'flex flex-col gap-1'}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={
              segmented
                ? `${segmentedStyles.option} ${segmentedStyles.checked}`
                : 'flex min-h-11 items-center gap-3 text-base'
            }
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className={segmented ? 'sr-only' : 'size-5 accent-accent'}
            />
            {option.label}
          </label>
        ))}
      </div>
      <FieldError id={errorId} error={error} />
    </fieldset>
  )
}
