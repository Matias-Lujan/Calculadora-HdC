import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { NumberInput } from '../../../components/NumberInput.tsx'
import { formatCookingFactor } from '../../../domain/dose/index.ts'
import {
  SAVE_ERROR_MESSAGE,
  cookingFactorUnusualMessage,
} from '../../../lib/errors.ts'
import {
  carbsLabel,
  initialFoodFormTexts,
  needsFactorConfirmation,
  newFoodReferenceDb,
  referenceCodeLabel,
  sourceText,
  toNewFood,
  unitLine,
  validateFoodForm,
  type FoodFormErrors,
  type FoodFormTexts,
} from '../foodForm.ts'
import { useCreateFood, useUpdateFood } from '../queries.ts'
import type { Food, FoodFormValues, FormSource } from '../types.ts'
import { CookingFactorFields } from './CookingFactorFields.tsx'
import { FieldError, RadioGroup, TextField } from './FormControls.tsx'

type Props = { mode: 'create' } | { mode: 'edit'; food: Food }

type ErrorField = keyof FoodFormErrors

const SOURCE_OPTIONS: readonly { value: FormSource; label: string }[] = [
  { value: 'manual', label: 'Otra fuente (manual)' },
  { value: 'reference', label: 'Tabla ARGENFOODS' },
]

const STATE_OPTIONS: readonly { value: Food['state']; label: string }[] = [
  { value: 'as_eaten', label: 'Tal como se come' },
  { value: 'raw_cooked', label: 'Crudo, se come cocido' },
]

/**
 * Create and edit form of a food (spec §6.2–§6.5). Validation and the values
 * to save come from foodForm.ts; this component only holds the state.
 */
export function FoodForm(props: Props) {
  const navigate = useNavigate()
  const createFood = useCreateFood()
  const updateFood = useUpdateFood()
  const mutation = props.mode === 'create' ? createFood : updateFood
  const food = props.mode === 'edit' ? props.food : null

  // Initialized once: a refetch does not overwrite what the user is editing.
  const [texts, setTexts] = useState(() =>
    initialFoodFormTexts(food ?? undefined),
  )
  // Only chosen when creating; an existing food keeps its source.
  const [newSource, setNewSource] = useState<FormSource>('manual')
  const source = food?.source ?? newSource
  // Names the source and the code field; an existing food keeps its own.
  const referenceDb =
    food === null ? newFoodReferenceDb(newSource) : food.reference_db
  // The error each field shows: the one found on its last blur or on the
  // last save attempt. It does not change while the user types (CLAUDE.md).
  const [shownErrors, setShownErrors] = useState<FoodFormErrors>({})
  // The unusual-factor confirmation is open (spec §6.4).
  const [confirmingFactor, setConfirmingFactor] = useState(false)

  const result = validateFoodForm(texts, source)

  function update(patch: Partial<FoodFormTexts>) {
    setTexts((current) => ({ ...current, ...patch }))
    setConfirmingFactor(false)
  }

  // Shows the current error (or none) of the given fields.
  function showErrorsOf(...fields: ErrorField[]) {
    setShownErrors((current) => {
      const next = { ...current }
      for (const field of fields) {
        const error = result.errors[field]
        if (error === undefined) delete next[field]
        else next[field] = error
      }
      return next
    })
  }

  function hideErrorsOf(...fields: ErrorField[]) {
    setShownErrors((current) => {
      const next = { ...current }
      for (const field of fields) delete next[field]
      return next
    })
  }

  function save(values: FoodFormValues) {
    setConfirmingFactor(false)
    const onSuccess = (saved: Food) =>
      void navigate(`/foods/${saved.id}`, { replace: true })
    if (food === null) {
      createFood.mutate(toNewFood(newSource, values), { onSuccess })
    } else {
      updateFood.mutate({ id: food.id, values }, { onSuccess })
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setShownErrors(result.errors)
    if (result.values === null) return
    if (needsFactorConfirmation(result.values)) {
      setConfirmingFactor(true)
      return
    }
    save(result.values)
  }

  const unitText = unitLine(texts)

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <h1 className="text-2xl font-semibold">
        {food === null ? 'Agregar alimento' : 'Editar alimento'}
      </h1>

      {food === null ? (
        <RadioGroup
          name="food-source"
          legend="Fuente"
          options={SOURCE_OPTIONS}
          value={newSource}
          onChange={(value) => {
            setNewSource(value)
            setConfirmingFactor(false)
            // Whether the note and the code are required depends on the
            // source: their old errors no longer apply.
            hideErrorsOf('notes', 'referenceCode')
          }}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Fuente</span>
          <span className="text-base">
            {sourceText(food.source, referenceDb)}
          </span>
        </div>
      )}

      <TextField
        id="food-name"
        label="Nombre"
        value={texts.name}
        onChange={(name) => update({ name })}
        onBlur={() => showErrorsOf('name')}
        error={shownErrors.name}
      />
      <TextField
        id="food-brand"
        label="Marca (opcional)"
        value={texts.brand}
        onChange={(brand) => update({ brand })}
      />

      {source === 'reference' && (
        <>
          <TextField
            id="food-reference-code"
            label={referenceCodeLabel(referenceDb)}
            value={texts.referenceCode}
            onChange={(referenceCode) => update({ referenceCode })}
            onBlur={() => showErrorsOf('referenceCode')}
            error={shownErrors.referenceCode}
          />
          <TextField
            id="food-reference-description"
            label="Descripción original (opcional)"
            value={texts.referenceDescription}
            onChange={(referenceDescription) =>
              update({ referenceDescription })
            }
          />
        </>
      )}

      <RadioGroup
        name="food-state"
        legend="Estado"
        options={STATE_OPTIONS}
        value={texts.state}
        onChange={(state) => {
          update({ state })
          hideErrorsOf('state')
        }}
        error={shownErrors.state}
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="food-carbs"
          className="text-sm font-medium text-slate-700"
        >
          {carbsLabel(referenceDb, texts.state)}
        </label>
        <NumberInput
          id="food-carbs"
          name="carbsPer100g"
          value={texts.carbsPer100g}
          onValueChange={(carbsPer100g) => update({ carbsPer100g })}
          onBlur={() => showErrorsOf('carbsPer100g')}
          invalid={shownErrors.carbsPer100g !== undefined}
          describedBy={
            shownErrors.carbsPer100g !== undefined
              ? 'food-carbs-error'
              : undefined
          }
        />
        <FieldError id={'food-carbs-error'} error={shownErrors.carbsPer100g} />
      </div>

      {texts.state === 'raw_cooked' && (
        <CookingFactorFields
          texts={texts}
          errors={shownErrors}
          onChange={update}
          onBlur={(field) =>
            field === 'cookingFactor'
              ? showErrorsOf('cookingFactor')
              : showErrorsOf(field, 'measuredFactor')
          }
        />
      )}

      {texts.state === 'as_eaten' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="food-unit-weight"
              className="text-sm font-medium text-slate-700"
            >
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
        id="food-notes"
        label={
          source === 'manual'
            ? 'Nota: de dónde sale el dato'
            : 'Nota (opcional)'
        }
        value={texts.notes}
        onChange={(notes) => update({ notes })}
        onBlur={() => showErrorsOf('notes')}
        error={shownErrors.notes}
        multiline
      />

      {confirmingFactor &&
        result.values !== null &&
        result.values.cooking_factor !== null && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900"
          >
            <p>
              {cookingFactorUnusualMessage(
                formatCookingFactor(result.values.cooking_factor),
              )}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="min-h-11 rounded-lg bg-amber-900 px-4 text-base font-medium text-white disabled:opacity-60"
                disabled={mutation.isPending}
                onClick={() => {
                  if (result.values !== null) save(result.values)
                }}
              >
                Guardar igual
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-amber-300 px-4 text-base"
                onClick={() => setConfirmingFactor(false)}
              >
                Revisar
              </button>
            </div>
          </div>
        )}

      {mutation.isError && (
        <p role="alert" className="text-sm text-red-700">
          {SAVE_ERROR_MESSAGE}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-slate-900 px-4 text-base font-medium text-white disabled:opacity-60"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <Link
          to={food === null ? '/foods' : `/foods/${food.id}`}
          className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-base"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
