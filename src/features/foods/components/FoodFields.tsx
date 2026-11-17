import type { ReactNode } from 'react'
import { DisclosureIcon } from '../../../components/DisclosureIcon.tsx'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
import { disclosure, fieldLabel } from '../../../components/styles.ts'
import type { Food } from '../../../lib/foods.ts'
import {
  unitLine,
  type CommonFoodErrors,
  type CommonFoodTexts,
} from '../foodForm.ts'
import { CookingFactorFields } from './CookingFactorFields.tsx'
import { FieldError, RadioGroup, TextField } from './FormControls.tsx'

type ErrorField = keyof CommonFoodErrors

const COOKED_OPTIONS: readonly { value: Food['state']; label: string }[] = [
  { value: 'raw_cooked', label: 'Sí' },
  { value: 'as_eaten', label: 'No' },
]

const COOKED_INFO =
  'Elegí «Sí» si los HC que cargás son del alimento crudo, como en el paquete de arroz o de fideos. Si ya son del alimento cocido, elegí «No».'

const MORE_OPTIONS_ID = 'food-more-options'

type Props = {
  texts: CommonFoodTexts
  shownErrors: CommonFoodErrors
  update: (patch: Partial<CommonFoodTexts>) => void
  showErrorsOf: (...fields: ErrorField[]) => void
  hideErrorsOf: (...fields: ErrorField[]) => void
  moreOptionsOpen: boolean
  setMoreOptionsOpen: (update: (current: boolean) => boolean) => void
  /** The factor of the food being edited; null for a new food. */
  savedCookingFactor: number | null
  /** Shown under the name, if any (the label: the name was not read). */
  nameNote?: string | null
  /** The carbs field (or fields), between the question and "Más opciones". */
  carbsField: ReactNode
}

/**
 * The fields every food form shows (spec §6.3): the name, "¿Se cocina antes
 * de comer?", the carbs (given by the form) and "Más opciones". Only
 * presentation: the state and the validation are the form's.
 */
export function FoodFields({
  texts,
  shownErrors,
  update,
  showErrorsOf,
  hideErrorsOf,
  moreOptionsOpen,
  setMoreOptionsOpen,
  savedCookingFactor,
  nameNote = null,
  carbsField,
}: Props) {
  const unitText = unitLine(texts)
  const nameField = (
    <TextField
      id="food-name"
      label="Nombre"
      value={texts.name}
      onChange={(name) => update({ name })}
      onBlur={() => showErrorsOf('name')}
      error={shownErrors.name}
    />
  )

  return (
    <>
      {nameNote === null ? (
        nameField
      ) : (
        <div className="flex flex-col gap-1 rounded-control bg-warning-soft p-3">
          {nameField}
          <FieldMessage tone="warning">{nameNote}</FieldMessage>
        </div>
      )}

      <RadioGroup
        name="food-state"
        legend="¿Se cocina antes de comer?"
        info={COOKED_INFO}
        options={COOKED_OPTIONS}
        segmented
        value={texts.state}
        onChange={(state) => {
          update({ state })
          hideErrorsOf('state')
          if (state === 'raw_cooked') setMoreOptionsOpen(() => true)
        }}
        error={shownErrors.state}
      />

      {carbsField}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={moreOptionsOpen}
          aria-controls={MORE_OPTIONS_ID}
          className={disclosure}
          onClick={() => setMoreOptionsOpen((current) => !current)}
        >
          <DisclosureIcon open={moreOptionsOpen} />
          Más opciones
        </button>

        {moreOptionsOpen && (
          <div id={MORE_OPTIONS_ID} className="flex flex-col gap-5">
            {texts.state === 'raw_cooked' && (
              <CookingFactorFields
                texts={texts}
                errors={shownErrors}
                savedCookingFactor={savedCookingFactor}
                onChange={update}
                onBlur={(field) => showErrorsOf(field, 'measuredFactor')}
              />
            )}

            {texts.state === 'as_eaten' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="food-unit-weight" className={fieldLabel}>
                    Peso por unidad (g) (opcional)
                  </label>
                  <NumberInput
                    id="food-unit-weight"
                    name="unitWeight"
                    value={texts.unitWeight}
                    onValueChange={(unitWeight) => update({ unitWeight })}
                    onBlur={() => showErrorsOf('unitWeight')}
                    invalid={shownErrors.unitWeight !== undefined}
                    describedBy={
                      shownErrors.unitWeight !== undefined
                        ? 'food-unit-weight-error'
                        : undefined
                    }
                  />
                  <FieldError
                    id={'food-unit-weight-error'}
                    error={shownErrors.unitWeight}
                  />
                </div>
                <TextField
                  id="food-unit-label"
                  label="Nombre de la unidad (opcional)"
                  placeholder="alfajor"
                  value={texts.unitLabel}
                  onChange={(unitLabel) => update({ unitLabel })}
                  // A name without a weight is an error of the weight field.
                  onBlur={() => showErrorsOf('unitWeight')}
                />
                <p aria-live="polite" className="text-base">
                  {unitText}
                </p>
              </div>
            )}

            <TextField
              id="food-brand"
              label="Marca (opcional)"
              value={texts.brand}
              onChange={(brand) => update({ brand })}
            />
            <TextField
              id="food-notes"
              label="Nota (opcional)"
              value={texts.notes}
              onChange={(notes) => update({ notes })}
              multiline
            />
          </div>
        )}
      </div>
    </>
  )
}
