import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router'
import {
  calculateMeal,
  type PositiveNumberError,
  type QuantityMode,
} from '../../../domain/dose/index.ts'
import {
  INVALID_RATIO_MESSAGE,
  MEAL_OUT_OF_RANGE_MESSAGE,
} from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import type { Settings } from '../../../lib/settings.ts'
import { doseLine, totalCarbsLine } from '../breakdown.ts'
import {
  newItemDraft,
  quantityError,
  toDoseSettings,
  toMealItemInput,
} from '../mealDraft.ts'
import type { MealItemDraft } from '../types.ts'
import { FoodPicker } from './FoodPicker.tsx'
import { MealItemCard } from './MealItemCard.tsx'

type Props = {
  foods: Food[]
  settings: Settings
}

/**
 * The meal being entered (spec §6.6), still without saving: the items, the
 * live breakdown (§8.3) and the exact dose. The calculation is derived in
 * the render from the form state, with calculateMeal (CLAUDE.md: no
 * react-query for the dose).
 */
export function MealForm({ foods, settings }: Props) {
  const [items, setItems] = useState<MealItemDraft[]>([])
  // The quantity error each item shows: the one found on its last blur. It
  // does not change while the user types (CLAUDE.md).
  const [shownErrors, setShownErrors] = useState<
    Record<number, PositiveNumberError | null>
  >({})
  const nextKey = useRef(0)

  const inputs = useMemo(() => items.map(toMealItemInput), [items])
  const result = useMemo(
    () => calculateMeal(inputs, toDoseSettings(settings)),
    [inputs, settings],
  )

  function handlePick(food: Food) {
    const key = nextKey.current
    nextKey.current += 1
    // The new field has to be in the DOM before focusing it, and the focus
    // has to happen inside the tap: iOS only opens the keyboard that way.
    flushSync(() => {
      setItems((current) => [...current, newItemDraft(key, food)])
    })
    document.getElementById(`meal-item-${key}-quantity`)?.focus()
  }

  function updateItem(key: number, change: Partial<MealItemDraft>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    )
  }

  function setShownError(key: number, error: PositiveNumberError | null) {
    setShownErrors((current) => ({ ...current, [key]: error }))
  }

  function handleModeChange(key: number, mode: QuantityMode) {
    updateItem(key, { quantityMode: mode, quantityText: '' })
    setShownError(key, null)
  }

  function handleRemove(key: number) {
    setItems((current) => current.filter((item) => item.key !== key))
    setShownErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {settings.max_dose_warning_units === null && (
        <div className="flex flex-col gap-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Todavía no configuraste la alerta de dosis máxima: si una dosis es
            alta, la app no te va a avisar.
          </p>
          <Link
            to="/settings"
            className="flex min-h-11 items-center self-start font-medium underline"
          >
            Ir a Configuración
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => (
            <MealItemCard
              key={item.key}
              item={item}
              input={inputs[index] ?? toMealItemInput(item)}
              result={result.items[index]}
              shownError={shownErrors[item.key] ?? null}
              onQuantityChange={(text) =>
                updateItem(item.key, { quantityText: text })
              }
              onQuantityBlur={() =>
                setShownError(
                  item.key,
                  quantityError(item.quantityText, result.items[index]),
                )
              }
              onModeChange={(mode) => handleModeChange(item.key, mode)}
              onRemove={() => handleRemove(item.key)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1 rounded-lg bg-slate-100 p-3">
        {items.length === 0 ? (
          <p className="text-slate-700">
            Agregá alimentos para ver los HC y la dosis.
          </p>
        ) : result.ok ? (
          <>
            <p className="text-slate-700">
              {totalCarbsLine(result.totalCarbsG)}
            </p>
            <p className="text-xl font-semibold">
              {doseLine(
                result.totalCarbsG,
                settings.carb_ratio_g_per_unit,
                result.doseUnits,
              )}
            </p>
          </>
        ) : result.errors.includes('INVALID_RATIO') ? (
          <p className="text-red-700">{INVALID_RATIO_MESSAGE}</p>
        ) : result.errors.includes('INVALID_QUANTITY') ? (
          <p className="text-red-700">{MEAL_OUT_OF_RANGE_MESSAGE}</p>
        ) : (
          <p className="text-slate-700">
            Para ver el total y la dosis, completá o corregí los alimentos de
            arriba.
          </p>
        )}
      </div>

      <FoodPicker foods={foods} onPick={handlePick} />
    </div>
  )
}
