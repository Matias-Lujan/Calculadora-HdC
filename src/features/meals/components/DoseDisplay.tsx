import { ChevronDown, CircleAlert, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import {
  formatDose,
  unitsWord,
  type MealResult,
} from '../../../domain/dose/index.ts'
import {
  INVALID_RATIO_MESSAGE,
  MEAL_OUT_OF_RANGE_MESSAGE,
} from '../../../lib/errors.ts'
import { displayCarbsText, doseLine, ratioText } from '../breakdown.ts'

type Props = {
  result: MealResult
  carbRatioGPerUnit: number
  /** The dose warning, already worded (mealLiveWarningMessage), or null. */
  warning: string | null
}

const CALCULATION_ID = 'meal-dose-calculation'

/**
 * Why there is no dose, said instead of the ratio line: an error of the
 * meal (spec §8.4, #45), or items to complete. null with a valid meal.
 */
function problemOf(
  result: MealResult,
): { error: boolean; text: string } | null {
  if (result.ok) return null
  if (result.errors.includes('INVALID_RATIO')) {
    return { error: true, text: INVALID_RATIO_MESSAGE }
  }
  if (result.errors.includes('INVALID_QUANTITY')) {
    return { error: true, text: MEAL_OUT_OF_RANGE_MESSAGE }
  }
  return {
    error: false,
    text: 'Para ver el total y la dosis, completá o corregí los alimentos.',
  }
}

/**
 * The dose display of Inicio (spec §6.6, docs/ux/revision-1.md UX-01): the
 * total carbs and the calculated dose, big and stuck to the top while the
 * screen scrolls, with the ratio always in sight and the calculation folded
 * under a "Ver la cuenta" arrow. With an item to complete or an error, "—"
 * instead of the numbers: never a partial dose. The message takes the place
 * of the ratio line, so the display keeps its height while typing.
 */
export function DoseDisplay({ result, carbRatioGPerUnit, warning }: Props) {
  const [open, setOpen] = useState(false)
  const dose = result.ok ? formatDose(result.doseUnits) : null
  const problem = problemOf(result)

  return (
    <div className="sticky top-[env(safe-area-inset-top)] z-10 flex flex-col gap-2 rounded-display bg-display p-4 text-on-display shadow-level-2">
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {/* A minimum width, so "Dosis calculada" does not jump when the
            carbs turn into "—". */}
        <div className="flex min-w-[5.5rem] flex-col justify-between">
          <dt className="text-xs text-on-display-soft">Hidratos</dt>
          <dd className="font-display text-2xl font-semibold whitespace-nowrap tabular-nums">
            {result.ok ? displayCarbsText(result.totalCarbsG) : '—'}
          </dd>
        </div>
        <div className="flex flex-col justify-between">
          <dt className="text-xs text-on-display-soft">Dosis calculada</dt>
          {/* The number and its word on the same baseline, never on two
              lines. */}
          <dd className="whitespace-nowrap">
            <span className="font-display text-5xl font-bold tabular-nums">
              {dose ?? '—'}
            </span>
            {dose !== null && (
              <>
                {' '}
                <span className="text-base">{unitsWord(dose)}</span>
              </>
            )}
          </dd>
        </div>
      </dl>

      {problem === null ? (
        <div className="flex min-h-11 items-center justify-between gap-2">
          <p className="text-xs text-on-display-soft">
            {ratioText(carbRatioGPerUnit)}
          </p>
          {/* ⌄ closed and ⌃ open: alone at the end of a line, a › would
              look like it goes to another screen. */}
          <button
            type="button"
            aria-label="Ver la cuenta"
            aria-expanded={open}
            aria-controls={CALCULATION_ID}
            className="-mr-2.5 inline-flex size-11 shrink-0 scroll-mt-0! items-center justify-center rounded-full text-on-display"
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown
              aria-hidden="true"
              className={`shrink-0 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      ) : (
        <p
          className={`flex min-h-11 items-center gap-1.5 text-sm ${problem.error ? 'text-on-display' : 'text-on-display-soft'}`}
        >
          {problem.error && (
            <CircleAlert aria-hidden="true" className="shrink-0" />
          )}
          <span className="min-w-0">{problem.text}</span>
        </p>
      )}

      {result.ok && open && (
        <p
          id={CALCULATION_ID}
          className="font-display text-sm font-semibold tabular-nums"
        >
          {doseLine(result.totalCarbsG, carbRatioGPerUnit, result.doseUnits)}
        </p>
      )}

      {/* Always in the page, so the warning is announced when it shows
          (WCAG 4.1.3); empty, it takes no room. Only the warning: the
          numbers change with every key. */}
      <div role="status" className="empty:-mt-2">
        {warning !== null && (
          <p className="flex items-start gap-1.5 text-sm text-on-display-warning">
            <TriangleAlert aria-hidden="true" className="shrink-0" />
            <span className="min-w-0">{warning}</span>
          </p>
        )}
      </div>
    </div>
  )
}
