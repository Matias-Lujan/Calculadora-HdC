import { useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Confirmation } from '../../../components/Confirmation.tsx'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
import {
  button,
  card,
  cardTitle,
  fieldLabel,
} from '../../../components/styles.ts'
import {
  formatUserNumber,
  parsePositiveUserNumber,
  type PositiveNumberError,
  type PositiveNumberResult,
} from '../../../domain/dose/index.ts'
import { focusFirstInvalid } from '../../../components/focusProblem.ts'
import {
  SAVE_ERROR_MESSAGE,
  positiveNumberErrorMessage,
  ratioErrorMessage,
} from '../../../lib/errors.ts'
import type { Settings } from '../../../lib/settings.ts'
import {
  ALERT_FIELDS,
  RATIO_LABEL_REST,
  RATIO_PHRASE_END,
  RATIO_PHRASE_START,
} from '../fields.ts'
import { useUpdateSettings } from '../queries.ts'
import { ratioChangeTexts, ratioExampleText, ratioSavedText } from '../ratio.ts'
import type { SettingsValues } from '../types.ts'

type FieldName = keyof SettingsValues

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

const RATIO_ID = 'settings-carb_ratio_g_per_unit'

function errorOf(result: PositiveNumberResult): PositiveNumberError | null {
  return 'error' in result ? result.error : null
}

type Props = {
  /**
   * The settings in effect: the cache of useSettings, which takes the row
   * the server returns on each save right away (afterSettingsSaved), even
   * if reading them again fails.
   */
  saved: Settings
}

export function SettingsForm({ saved }: Props) {
  const updateSettings = useUpdateSettings()
  // Initialized once: a refetch after saving does not overwrite what the
  // user is editing.
  const [texts, setTexts] = useState(() => initialTexts(saved))
  // The error each field shows: the one found on its last blur or on the
  // last save attempt. It does not change while the user types (CLAUDE.md).
  const [shownErrors, setShownErrors] = useState(NO_ERRORS)
  // "Guardado." is hidden as soon as the user edits after saving.
  const [editedSinceSubmit, setEditedSinceSubmit] = useState(false)
  // A new ratio asks for confirmation before saving (spec §6.8). The
  // confirmation takes the place of "Guardar": the focus goes to "No
  // cambiar" when it opens (Confirmation) and back to "Guardar" when that
  // closes it.
  const [confirmingRatio, setConfirmingRatio] = useState(false)
  const keepRatioButtonRef = useRef<HTMLButtonElement>(null)
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // The last save changed the ratio: its notice says the new one.
  const [lastSaveChangedRatio, setLastSaveChangedRatio] = useState(false)

  const results = {
    carb_ratio_g_per_unit: parsePositiveUserNumber(texts.carb_ratio_g_per_unit),
    max_dose_warning_units: parsePositiveUserNumber(
      texts.max_dose_warning_units,
    ),
    max_item_grams_warning: parsePositiveUserNumber(
      texts.max_item_grams_warning,
    ),
  }
  const ratio = results.carb_ratio_g_per_unit
  const dose = results.max_dose_warning_units
  const grams = results.max_item_grams_warning
  const values: SettingsValues | null =
    'error' in ratio || 'error' in dose || 'error' in grams
      ? null
      : {
          carb_ratio_g_per_unit: ratio.value,
          max_dose_warning_units: dose.value,
          max_item_grams_warning: grams.value,
        }

  function edit(name: FieldName, value: string) {
    setTexts((current) => ({ ...current, [name]: value }))
    setEditedSinceSubmit(true)
    setConfirmingRatio(false)
  }

  function save(toSave: SettingsValues) {
    setConfirmingRatio(false)
    setEditedSinceSubmit(false)
    setLastSaveChangedRatio(
      toSave.carb_ratio_g_per_unit !== saved.carb_ratio_g_per_unit,
    )
    updateSettings.mutate({ userId: saved.user_id, values: toSave })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Rendered right away, to take the user to the first error (UX-14).
    flushSync(() => {
      setShownErrors({
        carb_ratio_g_per_unit: errorOf(ratio),
        max_dose_warning_units: errorOf(dose),
        max_item_grams_warning: errorOf(grams),
      })
    })
    if (values === null) {
      focusFirstInvalid(formRef.current)
      return
    }
    // The numbers are compared, not the texts: "15" and "15,0" are the same
    // ratio. Only the alerts changed: saved right away.
    if (values.carb_ratio_g_per_unit !== saved.carb_ratio_g_per_unit) {
      setConfirmingRatio(true)
      return
    }
    save(values)
  }

  // "No cambiar": the field goes back to the ratio in effect, without saving.
  function keepRatio() {
    flushSync(() => {
      setConfirmingRatio(false)
      setTexts((current) => ({
        ...current,
        carb_ratio_g_per_unit: formatUserNumber(saved.carb_ratio_g_per_unit),
      }))
      setShownErrors((current) => ({ ...current, carb_ratio_g_per_unit: null }))
    })
    saveButtonRef.current?.focus()
  }

  const ratioError = shownErrors.carb_ratio_g_per_unit
  const ratioErrorId = `${RATIO_ID}-error`
  const example = 'error' in ratio ? null : ratioExampleText(ratio.value)
  const exampleId = `${RATIO_ID}-example`
  // VoiceOver reads the error and the example when entering the field.
  const ratioDescribedBy = [
    ...(ratioError !== null ? [ratioErrorId] : []),
    ...(example !== null ? [exampleId] : []),
  ].join(' ')
  const change =
    confirmingRatio && values !== null
      ? ratioChangeTexts(
          saved.carb_ratio_g_per_unit,
          values.carb_ratio_g_per_unit,
        )
      : null

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      onSubmit={handleSubmit}
      noValidate
    >
      {saved.max_dose_warning_units === null && (
        <Notice tone="warning">
          <p>
            Para empezar, completá la alerta de dosis máxima. Si una dosis la
            supera, la app te va a pedir que la confirmes.
          </p>
        </Notice>
      )}

      {/* The ratio, in its own card and written as a phrase (spec §6.8). */}
      <section className={`flex flex-col gap-2 ${card}`}>
        <h2 className={cardTitle}>Tu ratio</h2>
        <label htmlFor={RATIO_ID}>
          {RATIO_PHRASE_START}
          <span className="sr-only"> {RATIO_LABEL_REST}</span>
        </label>
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <NumberInput
              id={RATIO_ID}
              name="carb_ratio_g_per_unit"
              value={texts.carb_ratio_g_per_unit}
              onValueChange={(value) => edit('carb_ratio_g_per_unit', value)}
              onBlur={() =>
                setShownErrors((current) => ({
                  ...current,
                  carb_ratio_g_per_unit: errorOf(ratio),
                }))
              }
              invalid={ratioError !== null}
              describedBy={
                ratioDescribedBy === '' ? undefined : ratioDescribedBy
              }
            />
          </div>
          <span aria-hidden="true" className="flex min-h-12 items-center">
            {RATIO_PHRASE_END}
          </span>
        </div>
        {ratioError !== null && (
          <FieldMessage id={ratioErrorId}>
            {ratioErrorMessage(ratioError)}
          </FieldMessage>
        )}
        {example !== null && (
          <p id={exampleId} className="text-sm text-ink-soft">
            {example}
          </p>
        )}
      </section>

      {/* The alerts only warn: apart from the ratio, which changes the dose
          (UX-25). */}
      <section className={`flex flex-col gap-4 ${card}`}>
        <h2 className={cardTitle}>Alertas</h2>

        {ALERT_FIELDS.map(({ name, label, info }) => {
          const shownError = shownErrors[name]
          const showError = shownError !== null
          const inputId = `settings-${name}`
          const errorId = `${inputId}-error`
          return (
            <div key={name} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-1.5">
                <label htmlFor={inputId} className={fieldLabel}>
                  {label}
                </label>
                <InfoTip text={info} />
              </div>
              <NumberInput
                id={inputId}
                name={name}
                value={texts[name]}
                onValueChange={(value) => edit(name, value)}
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
                <FieldMessage id={errorId}>
                  {positiveNumberErrorMessage(shownError)}
                </FieldMessage>
              )}
            </div>
          )
        })}
      </section>

      {change !== null && values !== null ? (
        <Confirmation focusRef={keepRatioButtonRef}>
          <p className="font-semibold">{change.question}</p>
          <p>{change.detail}</p>
          {/* Neither is the main one: a rare change, with consequences. */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className={`${button.secondary} w-full`}
              onClick={() => save(values)}
            >
              Cambiar el ratio
            </button>
            <button
              ref={keepRatioButtonRef}
              type="button"
              className={`${button.secondary} w-full`}
              onClick={keepRatio}
            >
              No cambiar
            </button>
          </div>
        </Confirmation>
      ) : (
        <>
          {updateSettings.isError && (
            <Notice tone="error" role="alert">
              <p>{SAVE_ERROR_MESSAGE}</p>
            </Notice>
          )}

          {updateSettings.isSuccess && !editedSinceSubmit && (
            <Notice tone="success" role="status">
              <p>
                {lastSaveChangedRatio
                  ? ratioSavedText(
                      (updateSettings.data ?? saved).carb_ratio_g_per_unit,
                    )
                  : 'Guardado.'}
              </p>
            </Notice>
          )}

          <button
            ref={saveButtonRef}
            type="submit"
            className={button.primary}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      )}
    </form>
  )
}
