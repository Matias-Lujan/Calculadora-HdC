import { Camera } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router'
import { Confirmation } from '../../../components/Confirmation.tsx'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
import { revealAndFocus } from '../../../components/focusProblem.ts'
import { button, chip, field, fieldLabel } from '../../../components/styles.ts'
import {
  appliedDoseShortcuts,
  calculateMeal,
  formatDose,
  formatDoseCompact,
  formatUserNumber,
  parseNonNegativeUserNumber,
  unitsWord,
  type NonNegativeNumberError,
  type PositiveNumberError,
  type QuantityMode,
} from '../../../domain/dose/index.ts'
import {
  EATEN_AT_ERROR_MESSAGE,
  SAVE_ERROR_MESSAGE,
  appliedDoseErrorMessage,
  mealLiveWarningMessage,
  mealProblemMessage,
  mealSaveWarningMessage,
  type MealProblem,
} from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import {
  clearMealDraft,
  readMealDraft,
  writeMealDraft,
} from '../../../lib/mealDraftStorage.ts'
import { FROM_MEAL_STATE, foodToAddToMeal } from '../../../lib/mealHandoff.ts'
import type { Settings } from '../../../lib/settings.ts'
import { dateTimeInputValue, eatenAtFromInput } from '../eatenAt.ts'
import {
  appliedDose,
  appliedDoseFieldText,
  doseWarning,
  firstMealProblem,
  isAppliedDoseShortcut,
  itemWarnings,
  newItemDraft,
  quantityError,
  removeItem,
  restoreItem,
  saveWarnings,
  toDoseSettings,
  toMealItemInput,
  toNewMealRecord,
  type RemovedItem,
} from '../mealDraft.ts'
import { useCreateMeal } from '../queries.ts'
import {
  initialMealForm,
  parseStoredMealDraft,
  type StoredMealDraft,
} from '../storedDraft.ts'
import { tableFoodAsMealFood } from '../tableFoods.ts'
import type { MealFood, MealItemDraft, ReferenceFood } from '../types.ts'
import { DoseDisplay } from './DoseDisplay.tsx'
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
// How long "Quitaste {nombre}." and its "Deshacer" stay (spec §6.6).
const UNDO_MS = 5000
// Shared with FoodPicker: where the focus goes when no card is left after
// the removed one.
const ADD_FOOD_BUTTON_ID = 'meal-add-food'
const FOOD_SEARCH_ID = 'meal-food-search'

/** The element to take the user to for a problem (UX-14), or null. */
function problemElementId(
  problem: MealProblem,
  itemKey: number | null,
): string | null {
  switch (problem.code) {
    case 'QUANTITY':
      return `meal-item-${itemKey}-quantity`
    case 'FOOD':
      return `meal-item-${itemKey}`
    case 'APPLIED_DOSE':
      return APPLIED_DOSE_ID
    case 'EATEN_AT':
      return EATEN_AT_ID
    case 'MEAL':
      // The total and the dose: the dose display, always in sight.
      return null
  }
}

function errorOf<E>(result: { value: number } | { error: E }): E | null {
  return 'error' in result ? result.error : null
}

/**
 * The meal being entered (spec §6.6): the dose display, the items, the live
 * breakdown (§8.3), the applied dose, the date and time, and saving. The
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
  // The warnings confirmation is open (spec §8.5). It takes the place of
  // "Guardar": the focus goes to "Revisar" when it opens (Confirmation) and
  // back to "Guardar" when "Revisar" closes it.
  const [confirming, setConfirming] = useState(false)
  const reviewButtonRef = useRef<HTMLButtonElement>(null)
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  // The first problem the last "Guardar comida" found, named next to it.
  const [blockedProblem, setBlockedProblem] = useState<MealProblem | null>(null)
  // The item just removed, while "Deshacer" is offered (not kept in
  // sessionStorage).
  const [removed, setRemoved] = useState<RemovedItem | null>(null)
  const undoButtonRef = useRef<HTMLButtonElement>(null)
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

  // The items of the last render, for the timer of "Deshacer".
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  })

  // "Deshacer" goes away after a while; removing another item starts again.
  // If it had the focus, the focus goes to the card now in its place, or to
  // "+ Agregar alimento" (the search, without items) if none is left.
  useEffect(() => {
    if (removed === null) return
    const timer = window.setTimeout(() => {
      const hadFocus =
        undoButtonRef.current !== null &&
        undoButtonRef.current === document.activeElement
      flushSync(() => setRemoved(null))
      if (!hadFocus) return
      const current = itemsRef.current
      const next = current[removed.index]
      const target =
        next !== undefined
          ? `meal-item-${next.key}`
          : current.length > 0
            ? ADD_FOOD_BUTTON_ID
            : FOOD_SEARCH_ID
      document.getElementById(target)?.focus()
    }, UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [removed])

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
    setBlockedProblem(null)
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

  // No confirmation: "Quitaste {nombre}." with "Deshacer" for a while.
  // The notice takes the place of the card, and the focus goes to its
  // "Deshacer" (the ✕ that had it is gone).
  function handleRemove(key: number) {
    const next = removeItem(items, key)
    flushSync(() => {
      touch()
      setItems(next.items)
      if (next.removed !== null) setRemoved(next.removed)
      setShownErrors((current) => {
        const rest = { ...current }
        delete rest[key]
        return rest
      })
    })
    undoButtonRef.current?.focus()
  }

  // The removed item goes back to its place, with what it had typed, and
  // the focus goes to its card.
  function undoRemove() {
    if (removed === null) return
    flushSync(() => {
      touch()
      setItems((current) => restoreItem(current, removed))
      setRemoved(null)
    })
    document.getElementById(`meal-item-${removed.item.key}`)?.focus()
  }

  // After a save: an empty form and "Comida guardada.", with the id that
  // createMeal returned.
  function reset(id: string) {
    setItems([])
    setRemoved(null)
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
    const first = firstMealProblem(items, result, appliedDoseText, eatenAtText)
    // Rendered right away: the errors have to be on screen before going to
    // the first one, inside the tap (iOS only opens the keyboard that way).
    flushSync(() => {
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
      setAppliedDoseShownError(
        appliedDoseText === null
          ? null
          : errorOf(parseNonNegativeUserNumber(appliedDoseText)),
      )
      setEatenAtShownError(
        eatenAtText !== null && eatenAtFromInput(eatenAtText) === null,
      )
      setBlockedProblem(first?.problem ?? null)
    })

    if (first !== null) {
      const id = problemElementId(first.problem, first.itemKey)
      if (id !== null) revealAndFocus(document.getElementById(id))
      return
    }
    // A meal without a valid total is a problem above (MEAL).
    if (!result.ok) return
    if (saveWarnings(items, result, settings).length > 0) {
      setConfirming(true)
      return
    }
    save()
  }

  function review() {
    flushSync(() => setConfirming(false))
    saveButtonRef.current?.focus()
  }

  const warnings =
    confirming && result.ok ? saveWarnings(items, result, settings) : []
  const confirmationOpen = warnings.length > 0
  const appliedDoseInvalid = appliedDoseShownError !== null
  const liveDoseWarning = doseWarning(result, settings)
  const shortcuts = appliedDoseShortcuts(
    result.ok ? result.doseUnits : Number.NaN,
  )

  // "Quitaste {nombre}." with "Deshacer", for a while, in the place of the
  // removed card (at the end at most), so it never covers "Guardar comida"
  // (spec §6.6). Announced when it shows; the focus goes to "Deshacer".
  const undoIndex =
    removed === null ? -1 : Math.min(removed.index, items.length)
  const undoNotice =
    removed === null ? null : (
      <li
        key={`removed-${removed.item.key}`}
        role="status"
        className="flex items-center justify-between gap-3 rounded-card border border-dashed border-line-strong bg-sunken py-1 pr-2 pl-4"
      >
        <p className="min-w-0">{`Quitaste ${removed.item.food.name}.`}</p>
        <button
          ref={undoButtonRef}
          type="button"
          className={`${button.text} shrink-0 px-2`}
          onClick={undoRemove}
        >
          Deshacer
        </button>
      </li>
    )

  // The photo screen comes back here after saving, and the food is added to
  // the meal (spec §6.1, §14 #61). A link is not disabled by the fieldset:
  // while saving it is made inert by hand (also for the keyboard and
  // VoiceOver, which skip pointer-events).
  const photoLink = (
    <Link
      to="/foods/label"
      state={FROM_MEAL_STATE}
      aria-label="Agregar con foto"
      aria-disabled={createMeal.isPending || undefined}
      tabIndex={createMeal.isPending ? -1 : undefined}
      onClick={(event) => {
        if (savingRef.current || createMeal.isPending) event.preventDefault()
      }}
      className={`${button.secondary} shrink-0 aria-disabled:pointer-events-none aria-disabled:opacity-60`}
    >
      <Camera aria-hidden="true" className="shrink-0" />
      Con foto
    </Link>
  )

  return (
    // What gets the focus scrolls into view below the dose display, which
    // stays stuck to the top (WCAG 2.4.11): the display is at most about
    // 13rem tall, and 5rem more leave the name of a food in grams (or the
    // "1 alfajor = 50 g" hint of one in units) in sight.
    <fieldset
      className="flex min-w-0 flex-col gap-4 [&_:is(input,button,a,select)]:scroll-mt-[calc(18rem+env(safe-area-inset-top))]"
      disabled={createMeal.isPending}
    >
      {settings.max_dose_warning_units === null && (
        <Notice tone="warning">
          <p>
            Todavía no configuraste la alerta de dosis máxima: si una dosis es
            alta, la app no te va a avisar.
          </p>
          <Link to="/settings" className={`${button.text} self-start`}>
            Ir a Configuración
          </Link>
        </Notice>
      )}

      {savedMealId !== null && (
        <Notice tone="success">
          <p role="status">Comida guardada.</p>
          <Link
            to={`/history/${savedMealId}`}
            className={`${button.text} self-start`}
          >
            Ver en el historial
          </Link>
        </Notice>
      )}

      {notUsableFood !== null && (
        <Notice tone="warning">
          <p role="status">
            {`Guardaste "${notUsableFood.name}". Para usarlo en una comida, cargá cuánto rinde al cocinarlo.`}
          </p>
          <Link
            to={`/foods/${notUsableFood.id}/edit`}
            className={`${button.text} self-start`}
          >
            Cargar cuánto rinde
          </Link>
        </Notice>
      )}

      {/* Without items there is no dose display: the search comes first. */}
      {items.length > 0 && (
        <DoseDisplay
          result={result}
          carbRatioGPerUnit={settings.carb_ratio_g_per_unit}
          warning={
            liveDoseWarning === null
              ? null
              : mealLiveWarningMessage(liveDoseWarning)
          }
        />
      )}

      {(items.length > 0 || removed !== null) && (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => (
            <Fragment key={item.key}>
              {removed !== null && undoIndex === index && undoNotice}
              <MealItemCard
                key={item.key}
                item={item}
                input={inputs[index] ?? toMealItemInput(item)}
                result={result.items[index]}
                shownError={shownErrors[item.key] ?? null}
                warnings={itemWarnings(item, result.items[index], settings).map(
                  mealLiveWarningMessage,
                )}
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
            </Fragment>
          ))}
          {removed !== null && undoIndex === items.length && undoNotice}
        </ul>
      )}

      {/* "Agregar alimento" (soft) and "Con foto" (secondary), on one line
          under the items, where the next one goes (UX-06). Without items,
          the search is open and "Con foto" goes under it. */}
      <div className="flex flex-col gap-3">
        <FoodPicker
          foods={foods}
          tableFoods={tableFoods}
          onPick={handlePick}
          alwaysOpen={items.length === 0}
          besideButton={photoLink}
        />
        {items.length === 0 && photoLink}
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={APPLIED_DOSE_ID} className={fieldLabel}>
              Me apliqué
              {/* "unidades" is written inside the field, only seen. */}
              <span className="sr-only"> (unidades)</span>
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
              suffix="unidades"
              boxClassName="w-[11rem]"
              className="font-display text-xl font-semibold"
            />
            {appliedDoseShownError !== null && (
              <FieldMessage id={`${APPLIED_DOSE_ID}-error`}>
                {appliedDoseErrorMessage(appliedDoseShownError)}
              </FieldMessage>
            )}
            {/* Pen values around the calculated dose, and the calculated
                one (spec §6.6, #71). None starts chosen: until one is
                tapped (or something is typed), the field follows the
                calculated dose, exact. */}
            {shortcuts.penUnits.length > 0 && (
              <div
                id={`${APPLIED_DOSE_ID}-shortcuts`}
                role="group"
                aria-label="Valores de la lapicera"
                className="flex flex-wrap gap-2 pt-1"
              >
                {shortcuts.penUnits.map((units) => {
                  const text = formatDoseCompact(units)
                  return (
                    <button
                      key={units}
                      type="button"
                      aria-pressed={isAppliedDoseShortcut(
                        appliedDoseText,
                        units,
                      )}
                      className={chip}
                      onClick={() => {
                        touch()
                        setAppliedDoseText(formatUserNumber(units))
                        setAppliedDoseShownError(null)
                      }}
                    >
                      {text}
                      <span className="sr-only">{` ${unitsWord(text)}`}</span>
                    </button>
                  )
                })}
                {shortcuts.showCalculated && result.ok && (
                  <button
                    type="button"
                    // Never chosen (tapping it goes back to the start, with
                    // none chosen), but announced like the others.
                    aria-pressed={false}
                    className={chip}
                    onClick={() => {
                      touch()
                      setAppliedDoseText(null)
                      setAppliedDoseShownError(null)
                    }}
                  >
                    {formatDose(result.doseUnits)}
                    <span className="sr-only">
                      {` ${unitsWord(formatDose(result.doseUnits))}, la dosis calculada`}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {eatenAtText === null ? (
              <>
                <span className={fieldLabel}>Fecha y hora</span>
                <div className="flex items-center justify-between gap-2">
                  <span>Ahora</span>
                  <button
                    type="button"
                    className={button.text}
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
                <label htmlFor={EATEN_AT_ID} className={fieldLabel}>
                  Fecha y hora
                </label>
                <input
                  id={EATEN_AT_ID}
                  name={EATEN_AT_ID}
                  type="datetime-local"
                  className={`${field} appearance-none`}
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
                  <FieldMessage id={`${EATEN_AT_ID}-error`}>
                    {EATEN_AT_ERROR_MESSAGE}
                  </FieldMessage>
                )}
                <button
                  type="button"
                  className={`${button.text} self-start`}
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

          {/* The confirmation takes the place of "Guardar" (spec §8.5), with
              "Revisar" as the main button. */}
          {confirmationOpen ? (
            <Confirmation focusRef={reviewButtonRef}>
              <p className="font-semibold">Revisá antes de guardar</p>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {warnings.map((warning, index) => {
                  const { before, strong, after } =
                    mealSaveWarningMessage(warning)
                  return (
                    <li key={index}>
                      {before}
                      {strong !== '' && (
                        <strong className="font-display font-bold tabular-nums">
                          {strong}
                        </strong>
                      )}
                      {after}
                    </li>
                  )
                })}
              </ul>
              <div className="flex flex-col gap-3">
                <button
                  ref={reviewButtonRef}
                  type="button"
                  className={`${button.primary} w-full`}
                  onClick={review}
                >
                  Revisar
                </button>
                <button
                  type="button"
                  className={`${button.secondary} w-full`}
                  onClick={save}
                >
                  Guardar igual
                </button>
              </div>
            </Confirmation>
          ) : (
            <>
              {blockedProblem !== null ? (
                <Notice tone="error" role="alert">
                  <p>{mealProblemMessage(blockedProblem)}</p>
                </Notice>
              ) : (
                createMeal.isError && (
                  <Notice tone="error" role="alert">
                    <p>{SAVE_ERROR_MESSAGE}</p>
                  </Notice>
                )
              )}

              {/* type="button" and outside a <form>: the "Ir" key of the
                  search keyboard never saves. */}
              <button
                ref={saveButtonRef}
                type="button"
                className={button.primary}
                onClick={handleSave}
              >
                {createMeal.isPending ? 'Guardando…' : 'Guardar comida'}
              </button>
            </>
          )}
        </div>
      )}
    </fieldset>
  )
}
