import { useState } from 'react'
import type { FoodFieldError } from '../../lib/errors.ts'

type FormResult<F extends string, V> = {
  values: V | null
  errors: Partial<Record<F, FoodFieldError>>
}

type Options<T, F extends string, V> = {
  initialTexts: () => T
  initialMoreOptionsOpen: boolean
  /** Validates the texts: called on every render with the current ones. */
  validate: (texts: T) => FormResult<F, V>
}

/**
 * The state of a food form, shared by the manual form (FoodForm) and the
 * label confirmation (LabelFoodForm): the texts, the result of validating
 * them, the errors on screen, "Más opciones" and the confirmation on save
 * (unusual yield, and the calories warning of a label).
 */
export function useFoodFormState<T extends object, F extends string, V>({
  initialTexts,
  initialMoreOptionsOpen,
  validate,
}: Options<T, F, V>) {
  // Initialized once: a refetch does not overwrite what the user is editing.
  const [texts, setTexts] = useState(initialTexts)
  // "Más opciones" opens by itself (choosing "Sí", or saving with an error
  // inside) but never closes by itself. Folding it keeps and still
  // validates what is inside.
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(initialMoreOptionsOpen)
  // The error each field shows: the one found on its last blur or on the
  // last save attempt. It does not change while the user types (CLAUDE.md).
  const [shownErrors, setShownErrors] = useState<
    Partial<Record<F, FoodFieldError>>
  >({})
  // The confirmation on save is open: an unusual factor (spec §6.4) or,
  // from a label, carbs that do not agree with the calories (spec §6.1).
  const [confirmingFactor, setConfirmingFactor] = useState(false)

  const result = validate(texts)

  // Any change closes the confirmation.
  function update(patch: Partial<T>) {
    setTexts((current) => ({ ...current, ...patch }))
    setConfirmingFactor(false)
  }

  // Shows the current error (or none) of the given fields.
  function showErrorsOf(...fields: F[]) {
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

  function hideErrorsOf(...fields: F[]) {
    setShownErrors((current) => {
      const next = { ...current }
      for (const field of fields) delete next[field]
      return next
    })
  }

  return {
    texts,
    update,
    result,
    shownErrors,
    setShownErrors,
    showErrorsOf,
    hideErrorsOf,
    moreOptionsOpen,
    setMoreOptionsOpen,
    confirmingFactor,
    setConfirmingFactor,
  }
}
