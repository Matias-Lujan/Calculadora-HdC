import { useRef, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate } from 'react-router'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
import { focusFirstInvalid } from '../../../components/focusProblem.ts'
import { button, fieldLabel, pageTitle } from '../../../components/styles.ts'
import { SAVE_ERROR_MESSAGE } from '../../../lib/errors.ts'
import {
  carbsLabel,
  hasMoreOptionsErrors,
  initialFoodFormTexts,
  needsFactorConfirmation,
  startsWithMoreOptionsOpen,
  toNewFood,
  unusualYieldText,
  validateFoodForm,
} from '../foodForm.ts'
import type { Food } from '../../../lib/foods.ts'
import { useCreateFood, useUpdateFood } from '../queries.ts'
import type { FoodFormValues } from '../types.ts'
import { useFoodFormState } from '../useFoodFormState.ts'
import { FoodFields } from './FoodFields.tsx'
import { FieldError } from './FormControls.tsx'
import { UnusualYieldConfirmation } from './UnusualYieldConfirmation.tsx'

type Props =
  | {
      mode: 'create'
      /** The name the form starts with (what was searched in Inicio). */
      initialName?: string
      /** Where "Cancelar" goes; by default, Mis alimentos. */
      cancelTo?: string
      /** What happens after saving; by default, the food's detail. */
      onSaved?: (food: Food) => void
    }
  | { mode: 'edit'; food: Food }

const CARBS_INFO =
  'Gramos de hidratos de carbono cada 100 g, sin contar la fibra. En las etiquetas argentinas ya vienen sin fibra.'

/**
 * Create and edit form of a food (spec §6.3–§6.5). Validation and the values
 * to save come from foodForm.ts; this component only holds the state.
 */
export function FoodForm(props: Props) {
  const navigate = useNavigate()
  const createFood = useCreateFood()
  const updateFood = useUpdateFood()
  const mutation = props.mode === 'create' ? createFood : updateFood
  const food = props.mode === 'edit' ? props.food : null
  const savedCookingFactor = food?.cooking_factor ?? null
  const createOptions = props.mode === 'create' ? props : null

  const form = useFoodFormState({
    initialTexts: () => {
      const texts = initialFoodFormTexts(food ?? undefined)
      const name = createOptions?.initialName
      return name === undefined ? texts : { ...texts, name }
    },
    initialMoreOptionsOpen: startsWithMoreOptionsOpen(food ?? undefined),
    validate: (texts) =>
      validateFoodForm(texts, savedCookingFactor, food ?? undefined),
  })
  const { texts, update, result, shownErrors, showErrorsOf } = form
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function save(values: FoodFormValues) {
    form.setConfirmingFactor(false)
    const onSuccess = (saved: Food) => {
      if (createOptions?.onSaved !== undefined) {
        createOptions.onSaved(saved)
      } else {
        void navigate(`/foods/${saved.id}`, { replace: true })
      }
    }
    if (food === null) {
      createFood.mutate(toNewFood(values), { onSuccess })
    } else {
      updateFood.mutate({ id: food.id, values }, { onSuccess })
    }
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
    if (needsFactorConfirmation(result.values)) {
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

  const confirmationText =
    form.confirmingFactor &&
    result.values !== null &&
    result.values.cooking_factor !== null
      ? unusualYieldText(result.values.cooking_factor)
      : null

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-5"
      onSubmit={handleSubmit}
      noValidate
    >
      <h1 className={pageTitle}>
        {food === null ? 'Agregar alimento' : 'Editar alimento'}
      </h1>

      <FoodFields
        texts={texts}
        shownErrors={shownErrors}
        update={update}
        showErrorsOf={showErrorsOf}
        hideErrorsOf={form.hideErrorsOf}
        moreOptionsOpen={form.moreOptionsOpen}
        setMoreOptionsOpen={form.setMoreOptionsOpen}
        savedCookingFactor={savedCookingFactor}
        carbsField={
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-1">
              <label htmlFor="food-carbs" className={fieldLabel}>
                {carbsLabel(texts.state)}
                <span className="sr-only">, en gramos</span>
              </label>
              <InfoTip text={CARBS_INFO} />
            </div>
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
              suffix="g"
              boxClassName="w-[9.5rem] max-w-full"
            />
            <FieldError
              id={'food-carbs-error'}
              error={shownErrors.carbsPer100g}
              field="carbsPer100g"
            />
          </div>
        }
      />

      {/* The confirmation takes the place of "Guardar" and "Cancelar" (spec
          §6.4). Without a submit button, the form is not sent with Enter;
          any change closes it and brings "Guardar" back. */}
      {confirmationText !== null ? (
        <UnusualYieldConfirmation
          text={confirmationText}
          disabled={mutation.isPending}
          onConfirm={() => {
            if (result.values !== null) save(result.values)
          }}
          onReview={review}
        />
      ) : (
        <>
          {mutation.isError && (
            <Notice tone="error" role="alert">
              <p>{SAVE_ERROR_MESSAGE}</p>
            </Notice>
          )}

          <div className="flex flex-col gap-3">
            <button
              ref={saveButtonRef}
              type="submit"
              className={button.primary}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <Link
              to={
                food === null
                  ? (createOptions?.cancelTo ?? '/foods')
                  : `/foods/${food.id}`
              }
              className={button.secondary}
            >
              Cancelar
            </Link>
          </div>
        </>
      )}
    </form>
  )
}
