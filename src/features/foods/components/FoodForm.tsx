import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
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

type Props = { mode: 'create' } | { mode: 'edit'; food: Food }

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

  const form = useFoodFormState({
    initialTexts: () => initialFoodFormTexts(food ?? undefined),
    initialMoreOptionsOpen: startsWithMoreOptionsOpen(food ?? undefined),
    validate: (texts) =>
      validateFoodForm(texts, savedCookingFactor, food ?? undefined),
  })
  const { texts, update, result, shownErrors, showErrorsOf } = form

  function save(values: FoodFormValues) {
    form.setConfirmingFactor(false)
    const onSuccess = (saved: Food) =>
      void navigate(`/foods/${saved.id}`, { replace: true })
    if (food === null) {
      createFood.mutate(toNewFood(values), { onSuccess })
    } else {
      updateFood.mutate({ id: food.id, values }, { onSuccess })
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    form.setShownErrors(result.errors)
    if (hasMoreOptionsErrors(result.errors)) form.setMoreOptionsOpen(true)
    if (result.values === null) return
    if (needsFactorConfirmation(result.values)) {
      form.setConfirmingFactor(true)
      return
    }
    save(result.values)
  }

  const confirmationText =
    form.confirmingFactor &&
    result.values !== null &&
    result.values.cooking_factor !== null
      ? unusualYieldText(result.values.cooking_factor)
      : null

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
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
            />
            <FieldError
              id={'food-carbs-error'}
              error={shownErrors.carbsPer100g}
            />
          </div>
        }
      />

      {confirmationText !== null && (
        <UnusualYieldConfirmation
          text={confirmationText}
          disabled={mutation.isPending}
          onConfirm={() => {
            if (result.values !== null) save(result.values)
          }}
          onReview={() => form.setConfirmingFactor(false)}
        />
      )}

      {mutation.isError && (
        <Notice tone="error" role="alert">
          <p>{SAVE_ERROR_MESSAGE}</p>
        </Notice>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          className={button.primary}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <Link
          to={food === null ? '/foods' : `/foods/${food.id}`}
          className={button.secondary}
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
