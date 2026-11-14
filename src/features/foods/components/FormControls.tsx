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
  return (
    <p id={id} className="text-sm text-red-700">
      {foodFieldErrorMessage(error)}
    </p>
  )
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
    className:
      'min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-500 focus:outline-none aria-invalid:border-red-600',
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
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
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
  error?: FoodFieldError | undefined
}

export function RadioGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  error,
}: RadioGroupProps<T>) {
  const errorId = `${name}-error`
  const invalid = error !== undefined
  return (
    <fieldset
      className="flex flex-col gap-1"
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
    >
      <legend className="mb-1 text-sm font-medium text-slate-700">
        {legend}
      </legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-11 items-center gap-3 text-base"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="size-5"
          />
          {option.label}
        </label>
      ))}
      <FieldError id={errorId} error={error} />
    </fieldset>
  )
}
