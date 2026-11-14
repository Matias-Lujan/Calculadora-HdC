import { useState, type FormEvent } from 'react'
import { NumberInput } from '../../../components/NumberInput.tsx'
import {
  formatUserNumber,
  parsePositiveUserNumber,
  type PositiveNumberError,
  type PositiveNumberResult,
} from '../../../domain/dose/index.ts'
import {
  SAVE_ERROR_MESSAGE,
  positiveNumberErrorMessage,
} from '../../../lib/errors.ts'
import type { Settings } from '../../../lib/settings.ts'
import { useUpdateSettings } from '../queries.ts'
import type { SettingsValues } from '../types.ts'

type FieldName = keyof SettingsValues

const FIELDS: { name: FieldName; label: string }[] = [
  { name: 'carb_ratio_g_per_unit', label: 'Ratio (g de HC por unidad)' },
  { name: 'max_dose_warning_units', label: 'Alerta de dosis máxima (U)' },
  { name: 'max_item_grams_warning', label: 'Alerta de gramos por ítem (g)' },
]

type FieldTexts = Record<FieldName, string>

function initialTexts(initial: Settings): FieldTexts {
  return {
    carb_ratio_g_per_unit: formatUserNumber(initial.carb_ratio_g_per_unit),
    max_dose_warning_units:
      initial.max_dose_warning_units === null
        ? ''
        : formatUserNumber(initial.max_dose_warning_units),
    max_item_grams_warning: formatUserNumber(initial.max_item_grams_warning),
  }
}

type FieldErrors = Record<FieldName, PositiveNumberError | null>

const NO_ERRORS: FieldErrors = {
  carb_ratio_g_per_unit: null,
  max_dose_warning_units: null,
  max_item_grams_warning: null,
}

function errorOf(result: PositiveNumberResult): PositiveNumberError | null {
  return 'error' in result ? result.error : null
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const updateSettings = useUpdateSettings()
  // Initialized once: a refetch after saving does not overwrite what the
  // user is editing.
  const [texts, setTexts] = useState(() => initialTexts(initial))
  // The error each field shows: the one found on its last blur or on the
  // last save attempt. It does not change while the user types (CLAUDE.md).
  const [shownErrors, setShownErrors] = useState(NO_ERRORS)
  // "Guardado." is hidden as soon as the user edits after saving.
  const [editedSinceSubmit, setEditedSinceSubmit] = useState(false)

  const results = {
    carb_ratio_g_per_unit: parsePositiveUserNumber(texts.carb_ratio_g_per_unit),
    max_dose_warning_units: parsePositiveUserNumber(
      texts.max_dose_warning_units,
    ),
    max_item_grams_warning: parsePositiveUserNumber(
      texts.max_item_grams_warning,
    ),
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setShownErrors({
      carb_ratio_g_per_unit: errorOf(results.carb_ratio_g_per_unit),
      max_dose_warning_units: errorOf(results.max_dose_warning_units),
      max_item_grams_warning: errorOf(results.max_item_grams_warning),
    })
    const ratio = results.carb_ratio_g_per_unit
    const dose = results.max_dose_warning_units
    const grams = results.max_item_grams_warning
    if ('error' in ratio || 'error' in dose || 'error' in grams) return
    setEditedSinceSubmit(false)
    updateSettings.mutate({
      userId: initial.user_id,
      values: {
        carb_ratio_g_per_unit: ratio.value,
        max_dose_warning_units: dose.value,
        max_item_grams_warning: grams.value,
      },
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      {/* The row the server returned on save is newer than initial, so the
          notice goes away as soon as the save is confirmed. */}
      {(updateSettings.data ?? initial).max_dose_warning_units === null && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Para empezar, completá la alerta de dosis máxima. Si una dosis la
          supera, la app te va a pedir que la confirmes.
        </p>
      )}

      {FIELDS.map(({ name, label }) => {
        const shownError = shownErrors[name]
        const showError = shownError !== null
        const inputId = `settings-${name}`
        const errorId = `${inputId}-error`
        return (
          <div key={name} className="flex flex-col gap-1">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-slate-700"
            >
              {label}
            </label>
            <NumberInput
              id={inputId}
              name={name}
              value={texts[name]}
              onValueChange={(value) => {
                setTexts((current) => ({ ...current, [name]: value }))
                setEditedSinceSubmit(true)
              }}
              onBlur={() =>
                setShownErrors((current) => ({
                  ...current,
                  [name]: errorOf(results[name]),
                }))
              }
              invalid={showError}
              describedBy={showError ? errorId : undefined}
            />
            {shownError !== null && (
              <p id={errorId} className="text-sm text-red-700">
                {positiveNumberErrorMessage(shownError)}
              </p>
            )}
          </div>
        )
      })}

      {updateSettings.isError && (
        <p role="alert" className="text-sm text-red-700">
          {SAVE_ERROR_MESSAGE}
        </p>
      )}

      {updateSettings.isSuccess && !editedSinceSubmit && (
        <p role="status" className="text-sm text-green-800">
          Guardado.
        </p>
      )}

      <button
        type="submit"
        className="min-h-11 rounded-lg bg-slate-900 px-4 text-base font-medium text-white disabled:opacity-60"
        disabled={updateSettings.isPending}
      >
        {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
