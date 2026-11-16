import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router'
import { NumberInput } from '../../../components/NumberInput.tsx'
import {
  calculateMeal,
  parseNonNegativeUserNumber,
  type NonNegativeNumberError,
  type PositiveNumberError,
  type QuantityMode,
} from '../../../domain/dose/index.ts'
import {
  EATEN_AT_ERROR_MESSAGE,
  INVALID_RATIO_MESSAGE,
  MEAL_BLOCKED_MESSAGE,
  MEAL_OUT_OF_RANGE_MESSAGE,
  SAVE_ERROR_MESSAGE,
  mealSaveWarningMessage,
  positiveNumberErrorMessage,
} from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import {
  clearMealDraft,
  readMealDraft,
  writeMealDraft,
} from '../../../lib/mealDraftStorage.ts'
import { FROM_MEAL_STATE, foodToAddToMeal } from '../../../lib/mealHandoff.ts'
import type { Settings } from '../../../lib/settings.ts'
import { doseLine, doseText, totalCarbsText } from '../breakdown.ts'
import { dateTimeInputValue, eatenAtFromInput } from '../eatenAt.ts'
import {
  appliedDose,
  appliedDoseFieldText,
  newItemDraft,
  quantityError,
  saveWarnings,
  toDoseSettings,
  toMealItemInput,
  toNewMealRecord,
} from '../mealDraft.ts'
import { useCreateMeal } from '../queries.ts'
import {
  initialMealForm,
  parseStoredMealDraft,
  type StoredMealDraft,
} from '../storedDraft.ts'
import { tableFoodAsMealFood } from '../tableFoods.ts'
import type { MealFood, MealItemDraft, ReferenceFood } from '../types.ts'
import { CalculationDetails } from './CalculationDetails.tsx'
import { FoodPicker } from './FoodPicker.tsx'
import { MealItemCard } from './MealItemCard.tsx'

type Props = {
  foods: Food[]
  /** The reference table (spec §5.2), picked directly (spec §6.2). */
  referenceFoods: ReferenceFood[]
  settings: Settings
}

const APPLIED_DOSE_ID = 'meal-applied-dose'
const EATEN_AT_ID = 'meal-eaten-at'

function errorOf<E>(result: { value: number } | { error: E }): E | null {
  return 'error' in result ? result.error : null
}

/**
 * The meal being entered (spec §6.6): the items, the live breakdown (§8.3),
 * the exact dose, the applied dose, the date and time, and saving. The
 * calculation is derived in the render from the form state, with
 * calculateMeal (CLAUDE.md: no react-query for the dose).
 */
export function MealForm({ foods, referenceFoods, settings }: Props) {
  const tableFoods = useMemo(
    () => referenceFoods.map(tableFoodAsMealFood),
    [referenceFoods],
  )
  const location = useLocation()
  const navigate = useNavigate()
  // The meal kept while the app is open, and the food the photo screen sent
  // back, if any (spec §6.6, §14 #61). Read once, when Inicio opens.
  const [initial] = useState(() =>
    initialMealForm(
      parseStoredMealDraft(readMealDraft()),
      foodToAddToMeal(location.state),
    ),
  )
  const [items, setItems] = useState<MealItemDraft[]>(initial.items)
  // The quantity error each item shows: the one found on its last blur or
  // on the last "Guardar". It does not change while the user types
  // (CLAUDE.md).
  const [shownErrors, setShownErrors] = useState<
    Record<number, PositiveNumberError | null>
  >({})
  const nextKey = useRef(initial.nextKey)

  // null: the field follows the calculated dose (spec §14 #46).
  const [appliedDoseText, setAppliedDoseText] = useState<string | null>(
    initial.appliedDoseText,
  )
  const [appliedDoseShownError, setAppliedDoseShownError] =
    useState<NonNegativeNumberError | null>(null)
  // null: "Ahora", the moment "Guardar" is tapped.
  const [eatenAtText, setEatenAtText] = useState<string | null>(
    initial.eatenAtText,
  )
  const [eatenAtShownError, setEatenAtShownError] = useState(false)
  // The warnings confirmation is open (spec §8.5).
  const [confirming, setConfirming] = useState(false)
  // The last "Guardar" found errors.
  const [blocked, setBlocked] = useState(false)
  // The id of the meal just saved ("Comida guardada." and its link to the
  // history), until the next change.
  const [savedMealId, setSavedMealId] = useState<string | null>(null)
  const createMeal = useCreateMeal()
  // A save is in progress. isPending disables the fieldset only after the
  // next render, so a second tap in the same tick ("Guardar" or "Guardar
  // igual") would create a second meal without this (spec §14 #46).
  const savingRef = useRef(false)
  // A food saved from the photo that could not be added (it still needs how
  // much it yields), until the next change.
  const [notUsableFood, setNotUsableFood] = useState(initial.notUsableFood)

  // The food sent back from the photo is added once: the navigation state
  // that carried it is removed (it would survive a reload), and its
  // quantity gets the focus, as when a food is picked in the search.
  const addedFromPhoto =
    initial.focusKey !== null || initial.notUsableFood !== null
  useEffect(() => {
    if (!addedFromPhoto) return
    // preventScrollReset: the new history entry would scroll to the top and
    // hide the item that just got the focus.
    void navigate('/', { replace: true, state: null, preventScrollReset: true })
    if (initial.focusKey !== null) {
      document.getElementById(`meal-item-${initial.focusKey}-quantity`)?.focus()
    }
  }, [addedFromPhoto, initial.focusKey, navigate])

  // Every change is kept while the app is open; a meal without items (also
  // after saving it) is not kept. Only what the user entered: the
  // calculation is derived again in the render.
  useEffect(() => {
    if (items.length === 0) {
      clearMealDraft()
      return
    }
    const draft: StoredMealDraft = { items, appliedDoseText, eatenAtText }
    writeMealDraft(draft)
  }, [items, appliedDoseText, eatenAtText])

  const inputs = useMemo(() => items.map(toMealItemInput), [items])
  const result = useMemo(
    () => calculateMeal(inputs, toDoseSettings(settings)),
    [inputs, settings],
  )

  // Any change to the meal closes the confirmation and the notices of the
  // last "Guardar". The error of a failed save stays until the next one.
  function touch() {
    setConfirming(false)
    setBlocked(false)
    setSavedMealId(null)
    setNotUsableFood(null)
  }

  function handlePick(food: MealFood) {
    touch()
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
    touch()
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
    touch()
    setItems((current) => current.filter((item) => item.key !== key))
    setShownErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  // After a save: an empty form and "Comida guardada.", with the id that
  // createMeal returned.
  function reset(id: string) {
    setItems([])
    setShownErrors({})
    setAppliedDoseText(null)
    setAppliedDoseShownError(null)
    setEatenAtText(null)
    setEatenAtShownError(false)
    setSavedMealId(id)
  }

  function save() {
    if (savingRef.current) return
    if (!result.ok) return
    const applied = appliedDose(appliedDoseText, result.doseUnits)
    if ('error' in applied) return
    const eatenAt =
      eatenAtText === null
        ? new Date().toISOString()
        : eatenAtFromInput(eatenAtText)
    if (eatenAt === null) return
    setConfirming(false)
    // Built before taking the lock: if one of its invariants throws, the lock
    // must not stay on (mutate would not run and onSettled would never clear it).
    const record = toNewMealRecord(
      items,
      result,
      settings,
      applied.value,
      eatenAt,
    )
    savingRef.current = true
    createMeal.mutate(record, {
      onSuccess: reset,
      onSettled: () => {
        savingRef.current = false
      },
    })
  }

  function handleSave() {
    // A tap on "Guardar" right after "Guardar igual" must not reopen the
    // confirmation while the meal is being saved.
    if (savingRef.current) return
    touch()
    // Every pending error is shown, even in fields the user did not visit.
    setShownErrors(
      Object.fromEntries(
        items.map((item, index) => [
          item.key,
          quantityError(item.quantityText, result.items[index]),
        ]),
      ),
    )
    const doseError =
      appliedDoseText === null
        ? null
        : errorOf(parseNonNegativeUserNumber(appliedDoseText))
    setAppliedDoseShownError(doseError)
    const eatenAtInvalid =
      eatenAtText !== null && eatenAtFromInput(eatenAtText) === null
    setEatenAtShownError(eatenAtInvalid)

    if (!result.ok || doseError !== null || eatenAtInvalid) {
      setBlocked(true)
      return
    }
    if (saveWarnings(items, result, settings).length > 0) {
      setConfirming(true)
      return
    }
    save()
  }

  const warnings =
    confirming && result.ok ? saveWarnings(items, result, settings) : []
  const appliedDoseInvalid = appliedDoseShownError !== null

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-4"
      disabled={createMeal.isPending}
    >
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

      {savedMealId !== null && (
        <div className="flex flex-col gap-1 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <p role="status">Comida guardada.</p>
          <Link
            to={`/history/${savedMealId}`}
            className="flex min-h-11 items-center self-start font-medium underline"
          >
            Ver en el historial
          </Link>
        </div>
      )}

      {notUsableFood !== null && (
        <div className="flex flex-col gap-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p role="status">
            {`Guardaste "${notUsableFood.name}". Para usarlo en una comida, cargá cuánto rinde al cocinarlo.`}
          </p>
          <Link
            to={`/foods/${notUsableFood.id}/edit`}
            className="flex min-h-11 items-center self-start font-medium underline"
          >
            Cargar cuánto rinde
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

      {/* Without items there is no total box: the search comes first. */}
      {items.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg bg-slate-100 p-3">
          {result.ok ? (
            <>
              <p className="text-slate-700">
                {totalCarbsText(result.totalCarbsG)}
              </p>
              <p className="text-xl font-semibold">
                {doseText(result.doseUnits)}
              </p>
              <CalculationDetails
                lines={[
                  doseLine(
                    result.totalCarbsG,
                    settings.carb_ratio_g_per_unit,
                    result.doseUnits,
                  ),
                ]}
              />
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
      )}

      <div className="flex flex-col gap-3">
        <FoodPicker
          foods={foods}
          tableFoods={tableFoods}
          onPick={handlePick}
          alwaysOpen={items.length === 0}
        />
        {/* The photo screen comes back here after saving, and the food is
            added to the meal (spec §6.1, §14 #61). A link is not disabled
            by the fieldset: while saving it is made inert by hand (also for
            the keyboard and VoiceOver, which skip pointer-events). */}
        <Link
          to="/foods/label"
          state={FROM_MEAL_STATE}
          aria-disabled={createMeal.isPending || undefined}
          tabIndex={createMeal.isPending ? -1 : undefined}
          onClick={(event) => {
            if (savingRef.current || createMeal.isPending)
              event.preventDefault()
          }}
          className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-base aria-disabled:pointer-events-none aria-disabled:opacity-60"
        >
          Agregar con una foto
        </Link>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={APPLIED_DOSE_ID}
              className="text-sm font-medium text-slate-700"
            >
              Dosis aplicada (U)
            </label>
            {/* NumberInput writes a value that changes from outside to the
                field, so while it follows the calculated dose it updates
                with each change of the meal. */}
            <NumberInput
              id={APPLIED_DOSE_ID}
              name={APPLIED_DOSE_ID}
              value={appliedDoseFieldText(appliedDoseText, result)}
              onValueChange={(text) => {
                touch()
                setAppliedDoseText(text)
              }}
              onBlur={() =>
                setAppliedDoseShownError(
                  appliedDoseText === null
                    ? null
                    : errorOf(parseNonNegativeUserNumber(appliedDoseText)),
                )
              }
              invalid={appliedDoseInvalid}
              describedBy={
                appliedDoseInvalid ? `${APPLIED_DOSE_ID}-error` : undefined
              }
            />
            {appliedDoseShownError !== null && (
              <p
                id={`${APPLIED_DOSE_ID}-error`}
                className="text-sm text-red-700"
              >
                {positiveNumberErrorMessage(appliedDoseShownError)}
              </p>
            )}
            {appliedDoseText !== null && (
              <button
                type="button"
                className="min-h-11 self-start rounded-lg border border-slate-300 px-3 text-base"
                onClick={() => {
                  touch()
                  setAppliedDoseText(null)
                  setAppliedDoseShownError(null)
                }}
              >
                Usar la dosis calculada
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {eatenAtText === null ? (
              <>
                <span className="text-sm font-medium text-slate-700">
                  Fecha y hora
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span>Ahora</span>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-base"
                    onClick={() => {
                      touch()
                      setEatenAtText(dateTimeInputValue(new Date()))
                      setEatenAtShownError(false)
                    }}
                  >
                    Cambiar
                  </button>
                </div>
              </>
            ) : (
              <>
                <label
                  htmlFor={EATEN_AT_ID}
                  className="text-sm font-medium text-slate-700"
                >
                  Fecha y hora
                </label>
                <input
                  id={EATEN_AT_ID}
                  name={EATEN_AT_ID}
                  type="datetime-local"
                  className="min-h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 text-base focus:border-slate-500 focus:outline-none aria-invalid:border-red-600"
                  value={eatenAtText}
                  onChange={(event) => {
                    touch()
                    setEatenAtText(event.target.value)
                  }}
                  onBlur={() =>
                    setEatenAtShownError(eatenAtFromInput(eatenAtText) === null)
                  }
                  aria-invalid={eatenAtShownError}
                  aria-describedby={
                    eatenAtShownError ? `${EATEN_AT_ID}-error` : undefined
                  }
                />
                {eatenAtShownError && (
                  <p
                    id={`${EATEN_AT_ID}-error`}
                    className="text-sm text-red-700"
                  >
                    {EATEN_AT_ERROR_MESSAGE}
                  </p>
                )}
                <button
                  type="button"
                  className="min-h-11 self-start rounded-lg border border-slate-300 px-3 text-base"
                  onClick={() => {
                    touch()
                    setEatenAtText(null)
                    setEatenAtShownError(false)
                  }}
                >
                  Usar ahora
                </button>
              </>
            )}
          </div>

          {confirming && warnings.length > 0 ? (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900"
            >
              <p>Revisá antes de guardar:</p>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {warnings.map((warning, index) => (
                  <li key={index}>{mealSaveWarningMessage(warning)}</li>
                ))}
              </ul>
              <p>¿La guardás igual?</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-amber-900 px-4 text-base font-medium text-white disabled:opacity-60"
                  onClick={save}
                >
                  Guardar igual
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-amber-300 px-4 text-base"
                  onClick={() => setConfirming(false)}
                >
                  Revisar
                </button>
              </div>
            </div>
          ) : blocked ? (
            <p role="alert" className="text-sm text-red-700">
              {MEAL_BLOCKED_MESSAGE}
            </p>
          ) : (
            createMeal.isError && (
              <p role="alert" className="text-sm text-red-700">
                {SAVE_ERROR_MESSAGE}
              </p>
            )
          )}

          {/* type="button" and outside a <form>: the "Ir" key of the
              search keyboard never saves. */}
          <button
            type="button"
            className="min-h-11 rounded-lg bg-slate-900 px-4 text-base font-medium text-white disabled:opacity-60"
            onClick={handleSave}
          >
            {createMeal.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </fieldset>
  )
}
