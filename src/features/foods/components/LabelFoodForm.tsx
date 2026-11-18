import { Plus } from 'lucide-react'
import { useRef, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
import { focusFirstInvalid } from '../../../components/focusProblem.ts'
import { button, fieldLabel, pageTitle } from '../../../components/styles.ts'
import type { FoodFieldError, RequiredFoodField } from '../../../lib/errors.ts'
import { SAVE_ERROR_MESSAGE } from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import {
  carbsLabel,
  hasMoreOptionsErrors,
  needsFactorConfirmation,
  unusualYieldText,
} from '../foodForm.ts'
import {
  asksBasis,
  asksColumn,
  carbsLine,
  carbsRowText,
  chooseColumn,
  chosenColumn,
  ENERGY_CONFIRMATION_TEXT,
  columnOptionText,
  energyWarning,
  fieldNote,
  initialLabelFormTexts,
  nameNote,
  needsFiberWarning,
  startsEmpty,
  toNewLabelFood,
  unitOffer,
  validateLabelForm,
  type LabelFormErrors,
} from '../labelForm.ts'
import { useCreateFood } from '../queries.ts'
import type { TranscribedField, Transcription } from '../transcription.ts'
import type { FoodFormValues } from '../types.ts'
import { useFoodFormState } from '../useFoodFormState.ts'
import { FoodFields } from './FoodFields.tsx'
import { FieldError, RadioGroup } from './FormControls.tsx'
import { StickyLabelPhoto } from './StickyLabelPhoto.tsx'
import { UnusualYieldConfirmation } from './UnusualYieldConfirmation.tsx'

type Props = {
  /** The photo to compare with (a local URL of the uploaded JPEG). */
  photoUrl: string
  photoPath: string
  /** null when loaded by hand (the reading failed, spec §9.4). */
  transcription: Transcription | null
  onCancel: () => void
  /** Where to go once the food is saved (it depends on where the screen was opened from). */
  onSaved: (food: Food) => void
}

type NumberField = 'portion' | 'labelCarbs' | 'fiber'

const BASIS_OPTIONS = [
  { value: 'per_portion', label: 'De una porción' },
  { value: 'per_100g', label: 'Cada 100 g' },
] as const

/**
 * The confirmation of a food from the photo of its label (spec §6.1),
 * always before saving. Validation and the values to save come from
 * labelForm.ts; this component only holds the state.
 */
export function LabelFoodForm({
  photoUrl,
  photoPath,
  transcription,
  onCancel,
  onSaved,
}: Props) {
  const createFood = useCreateFood()

  const form = useFoodFormState({
    initialTexts: () => initialLabelFormTexts(transcription),
    initialMoreOptionsOpen: false,
    validate: (texts) => validateLabelForm(texts, transcription),
  })
  const { texts, update, result, shownErrors, showErrorsOf, hideErrorsOf } =
    form
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const columns = transcription?.columns ?? []
  const column = chosenColumn(texts, transcription)
  const fiberShown = needsFiberWarning(transcription) && texts.basis !== null
  const line = carbsLine(texts, transcription)
  const energy = energyWarning(texts, transcription)
  const offer = unitOffer(texts, transcription)
  const observations = transcription?.observations?.trim() ?? ''

  function save(values: FoodFormValues) {
    form.setConfirmingFactor(false)
    createFood.mutate(toNewLabelFood(values, photoPath, transcription), {
      onSuccess: onSaved,
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Rendered right away, to take the user to the first error (UX-14).
    flushSync(() => {
      form.setShownErrors(result.errors)
      if (hasMoreOptionsErrors(result.errors)) form.setMoreOptionsOpen(true)
    })
    if (result.values === null) {
      focusFirstInvalid(formRef.current)
      return
    }
    // The calories warning and an unusual yield share one confirmation.
    if (energy !== null || needsFactorConfirmation(result.values)) {
      form.setConfirmingFactor(true)
      return
    }
    save(result.values)
  }

  // "Revisar" closes the confirmation and gives the focus back to "Guardar",
  // which comes back in its place.
  function review() {
    flushSync(() => form.setConfirmingFactor(false))
    saveButtonRef.current?.focus()
  }

  function numberField(
    field: NumberField,
    label: string,
    origin: TranscribedField | null,
  ) {
    const id = `label-${field}`
    const error: FoodFieldError | undefined = shownErrors[field]
    const noteId = `${id}-note`
    const errorId = `${id}-error`
    // Empty because of the photo (illegible, missing or not a plain number).
    const flagged = origin !== null && startsEmpty(origin)
    const describedBy = [
      origin !== null ? noteId : null,
      error !== undefined ? errorId : null,
    ]
      .filter((value) => value !== null)
      .join(' ')
    return (
      <div
        className={`flex flex-col gap-1 ${flagged ? 'rounded-control bg-warning-soft p-3' : ''}`}
      >
        <label htmlFor={id} className={fieldLabel}>
          {label}
        </label>
        <NumberInput
          id={id}
          name={field}
          value={texts[field]}
          onValueChange={(value) => update({ [field]: value })}
          onBlur={() => showErrorsOf(field)}
          invalid={error !== undefined}
          describedBy={describedBy === '' ? undefined : describedBy}
        />
        {origin !== null &&
          (flagged ? (
            <FieldMessage id={noteId} tone="warning">
              {fieldNote(origin)}
            </FieldMessage>
          ) : (
            <p id={noteId} className="text-sm text-ink-soft">
              {fieldNote(origin)}
            </p>
          ))}
        <FieldError id={errorId} error={error} field={requiredField(field)} />
      </div>
    )
  }

  // What an empty field says, in the words of its label (UX-14). The fiber
  // is optional: it is never empty-and-required.
  function requiredField(field: NumberField): RequiredFoodField | undefined {
    switch (field) {
      case 'portion':
        return 'portion'
      case 'labelCarbs':
        return texts.basis === 'per_portion' ? 'portionCarbs' : 'carbsPer100g'
      case 'fiber':
        return undefined
    }
  }

  // The texts of the confirmation on save: the calories warning and an
  // unusual yield, whichever apply, in a single "Guardar igual".
  const confirmationParts: string[] = []
  if (form.confirmingFactor && result.values !== null) {
    if (energy !== null) confirmationParts.push(ENERGY_CONFIRMATION_TEXT)
    const factor = result.values.cooking_factor
    const yieldText =
      factor !== null && needsFactorConfirmation(result.values)
        ? unusualYieldText(factor)
        : null
    if (yieldText !== null) confirmationParts.push(yieldText)
  }
  const confirmationText =
    confirmationParts.length > 0 ? confirmationParts.join(' ') : null

  // The errors of the fields above "¿Se cocina antes de comer?".
  const labelErrors: (keyof LabelFormErrors)[] = [
    'column',
    'basis',
    'portion',
    'labelCarbs',
    'fiber',
  ]

  return (
    // What gets the focus scrolls into view below the photo, which stays
    // stuck to the top (a third of the screen, UX-16).
    <form
      ref={formRef}
      className="flex flex-col gap-5 [&_:is(input,button,select,textarea)]:scroll-mt-[calc(22svh+2rem+env(safe-area-inset-top))]"
      onSubmit={handleSubmit}
      noValidate
    >
      <h1 className={pageTitle}>Revisá los datos</h1>

      <StickyLabelPhoto url={photoUrl} />

      {observations !== '' && (
        <p className="text-sm text-ink">{`Al leer la foto: ${observations}`}</p>
      )}

      {asksColumn(transcription) && (
        <RadioGroup
          name="label-column"
          legend="¿Qué columna usás?"
          options={columns.map((option, index) => ({
            value: String(index),
            label: columnOptionText(option, index),
          }))}
          value={texts.column === null ? null : String(texts.column)}
          onChange={(value) => {
            const index = Number(value)
            const chosen = columns[index]
            if (chosen === undefined) return
            update(chooseColumn(chosen, index))
            hideErrorsOf(...labelErrors)
          }}
          error={shownErrors.column}
        />
      )}

      {asksBasis(texts, transcription) &&
        (!asksColumn(transcription) || texts.column !== null) && (
          <RadioGroup
            name="label-basis"
            legend="¿Los HC de la etiqueta son de una porción o cada 100 g?"
            options={BASIS_OPTIONS}
            segmented
            value={texts.basis}
            onChange={(basis) => {
              update({ basis })
              hideErrorsOf('basis', 'portion', 'labelCarbs', 'fiber')
            }}
            error={shownErrors.basis}
          />
        )}

      {texts.basis !== null && (
        // The portion and the carbs, together and above the rest, to compare
        // them with the photo: the only real safeguard against a misread
        // (spec §6.1).
        <section className="flex flex-col gap-3 rounded-card border-2 border-ink bg-surface p-4 shadow-level-1">
          <h2 className="font-display text-xl font-semibold">
            Compará con la foto de la etiqueta
          </h2>
          {texts.basis === 'per_portion' ? (
            <div className="grid grid-cols-2 items-start gap-3">
              {numberField(
                'portion',
                'Porción (g)',
                column?.portion_size_g ?? null,
              )}
              {numberField(
                'labelCarbs',
                'HC en la porción (g)',
                column?.carbohydrates_g ?? null,
              )}
            </div>
          ) : (
            numberField(
              'labelCarbs',
              carbsLabel(texts.state),
              column?.carbohydrates_g ?? null,
            )
          )}
          <p aria-live="polite" className="text-base">
            {line}
          </p>
          {/* Always in the page, so the warning is announced when it shows. */}
          <div aria-live="polite">
            {energy !== null && (
              <Notice tone="warning">
                <p>{energy}</p>
              </Notice>
            )}
          </div>
        </section>
      )}

      {fiberShown && (
        <Notice tone="warning">
          <p>
            {`La etiqueta dice "${carbsRowText(transcription)}". En ese formato los HC pueden incluir la fibra. Si la etiqueta trae la fibra, cargala y la app la resta.`}
          </p>
          {numberField(
            'fiber',
            texts.basis === 'per_portion'
              ? 'Fibra en la porción (g) (opcional)'
              : 'Fibra cada 100 g (g) (opcional)',
            null,
          )}
        </Notice>
      )}

      {offer !== null && (
        <button
          type="button"
          className={button.soft}
          onClick={() => {
            update({ unitWeight: offer.weightText, unitLabel: offer.label })
            hideErrorsOf('unitWeight')
            form.setMoreOptionsOpen(true)
          }}
        >
          <Plus aria-hidden="true" />
          {`Guardar también 1 ${offer.label} = ${offer.weightText} g`}
        </button>
      )}

      <FoodFields
        texts={texts}
        shownErrors={shownErrors}
        update={update}
        showErrorsOf={showErrorsOf}
        hideErrorsOf={hideErrorsOf}
        moreOptionsOpen={form.moreOptionsOpen}
        setMoreOptionsOpen={form.setMoreOptionsOpen}
        savedCookingFactor={null}
        nameNote={nameNote(transcription)}
        carbsField={null}
      />

      {/* The confirmation takes the place of "Guardar" and "Cancelar" (spec
          §6.1). Without a submit button, the form is not sent with Enter;
          any change closes it and brings "Guardar" back. */}
      {confirmationText !== null ? (
        <UnusualYieldConfirmation
          text={confirmationText}
          disabled={createFood.isPending}
          onConfirm={() => {
            if (result.values !== null) save(result.values)
          }}
          onReview={review}
        />
      ) : (
        <>
          {createFood.isError && (
            <Notice tone="error" role="alert">
              <p>{SAVE_ERROR_MESSAGE}</p>
            </Notice>
          )}

          <div className="flex flex-col gap-3">
            <button
              ref={saveButtonRef}
              type="submit"
              className={button.primary}
              disabled={createFood.isPending}
            >
              {createFood.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              className={button.secondary}
              disabled={createFood.isPending}
              onClick={onCancel}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </form>
  )
}
