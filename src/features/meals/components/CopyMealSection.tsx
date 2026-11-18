import { Copy, PencilLine } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import { Confirmation } from '../../../components/Confirmation.tsx'
import { button } from '../../../components/styles.ts'
import { readMealDraft } from '../../../lib/mealDraftStorage.ts'
import { mealCopyState, type MealCopyMode } from '../mealCopy.ts'
import { parseStoredMealDraft } from '../storedDraft.ts'
import type { SavedMeal } from '../types.ts'

type Props = {
  meal: SavedMeal
}

/**
 * "Repetir esta comida" and "Corregir" in the meal detail (spec §6.7,
 * UX-09 and UX-10): they load the meal in Inicio, which takes each food as
 * it is today (src/features/meals/mealCopy.ts). If a meal is being entered
 * in Inicio, a box asks before replacing it, in the place of the buttons,
 * with "No reemplazar" as the safe button.
 */
export function CopyMealSection({ meal }: Props) {
  const navigate = useNavigate()
  const [asking, setAsking] = useState<MealCopyMode | null>(null)
  const keepButtonRef = useRef<HTMLButtonElement>(null)
  const repeatButtonRef = useRef<HTMLButtonElement>(null)
  const correctButtonRef = useRef<HTMLButtonElement>(null)

  function load(mode: MealCopyMode) {
    void navigate('/', {
      state: mealCopyState({
        mode,
        mealId: meal.id,
        eatenAt: meal.eaten_at,
        appliedDoseUnits: meal.applied_dose_units,
        items: meal.meal_items,
      }),
    })
  }

  function start(mode: MealCopyMode) {
    // A meal in progress is one Inicio would restore (with items).
    if (parseStoredMealDraft(readMealDraft()) !== null) {
      setAsking(mode)
      return
    }
    load(mode)
  }

  // "No reemplazar" closes the box and gives the focus back to the button
  // that opened it.
  function keep() {
    const mode = asking
    flushSync(() => setAsking(null))
    ;(mode === 'correct' ? correctButtonRef : repeatButtonRef).current?.focus()
  }

  if (asking !== null) {
    return (
      <Confirmation focusRef={keepButtonRef}>
        <p>Tenés una comida a medio cargar. ¿La reemplazás por esta?</p>
        <div className="flex flex-col gap-3">
          <button
            ref={keepButtonRef}
            type="button"
            className={`${button.primary} w-full`}
            onClick={keep}
          >
            No reemplazar
          </button>
          <button
            type="button"
            className={`${button.secondary} w-full`}
            onClick={() => load(asking)}
          >
            Reemplazar
          </button>
        </div>
      </Confirmation>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        ref={repeatButtonRef}
        type="button"
        className={button.secondary}
        onClick={() => start('repeat')}
      >
        <Copy aria-hidden="true" className="shrink-0" />
        Repetir esta comida
      </button>
      <button
        ref={correctButtonRef}
        type="button"
        className={button.secondary}
        onClick={() => start('correct')}
      >
        <PencilLine aria-hidden="true" className="shrink-0" />
        Corregir
      </button>
    </div>
  )
}
