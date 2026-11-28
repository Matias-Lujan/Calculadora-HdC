import { Plus, Search } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router'
import { Confirmation } from '../../../components/Confirmation.tsx'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { Notice } from '../../../components/Notice.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
import { PhotoPickerButton } from '../../../components/PhotoPickerButton.tsx'
import { revealAndFocus } from '../../../components/focusProblem.ts'
import { APP_NAV_ID } from '../../../components/AppLayout.tsx'
import {
  button,
  chip,
  enter,
  field,
  fieldLabel,
  pageTitle,
} from '../../../components/styles.ts'
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
  CORRECTION_DELETE_ERROR_MESSAGE,
  EATEN_AT_ERROR_MESSAGE,
  SAVE_ERROR_MESSAGE,
  appliedDoseErrorMessage,
  mealCopySkipMessage,
  mealLiveWarningMessage,
  mealProblemMessage,
  mealSaveWarningMessage,
  type MealProblem,
} from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import { holdLabelPhoto } from '../../../lib/labelPhotoHandoff.ts'
import {
  clearMealDraft,
  readMealDraft,
  writeMealDraft,
} from '../../../lib/mealDraftStorage.ts'
import { FROM_MEAL_STATE, foodToAddToMeal } from '../../../lib/mealHandoff.ts'
import type { Settings } from '../../../lib/settings.ts'
import {
  dateTimeInputValue,
  eatenAtFromInput,
  ofMealMoment,
} from '../eatenAt.ts'
import { FOOD_SEARCH_STATE, isFoodSearchState } from '../foodSearchState.ts'
import { mealCopyRequest } from '../mealCopy.ts'
import { recentFoods, suggestedMeals } from '../recentMeals.ts'
import {
  appliedDose,
  appliedDoseFieldText,
  doseWarning,
  eatenAtToSave,
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
import { savedMealText } from '../breakdown.ts'
import { useCreateMeal, useOtherMealSave } from '../queries.ts'
import {
  copiedMealForm,
  initialMealForm,
  mealChanged,
  newClientKey,
  parseStoredMealDraft,
  type InitialMealForm,
  type KeyedMeal,
  type StoredMealDraft,
} from '../storedDraft.ts'
import { tableFoodAsMealFood } from '../tableFoods.ts'
import type {
  MealFood,
  MealItemDraft,
  RecentMeal,
  ReferenceFood,
  SavedMealResult,
} from '../types.ts'
import { DoseDisplay } from './DoseDisplay.tsx'
import { FOOD_SEARCH_INPUT_ID, FoodSearchSheet } from './FoodSearchSheet.tsx'
import { MealItemCard } from './MealItemCard.tsx'
import { MealSuggestions } from './MealSuggestions.tsx'
import { RecentFoods } from './RecentFoods.tsx'

type Props = {
  foods: Food[]
  /** The reference table (spec §5.2), picked directly (spec §6.2). */
  referenceFoods: ReferenceFood[]
  settings: Settings
  /**
   * The last meals, for the shortcuts of an empty Inicio; undefined while
   * they load (or if they could not be read): then they are not shown.
   */
  recentMeals: RecentMeal[] | undefined
}

/** The title of Inicio without foods (UX-23); with them, "Nueva comida". */
export const EMPTY_MEAL_TITLE = '¿Qué vas a comer?'

const APPLIED_DOSE_ID = 'meal-applied-dose'
const EATEN_AT_ID = 'meal-eaten-at'
// How long "Quitaste {nombre}." and its "Deshacer" stay (spec §6.6).
const UNDO_MS = 5000
// What opens the search: "+ Agregar alimento" (with items) and the search
// field of an empty Inicio. The focus goes back to them when it closes, and
// to them when no card is left after a removed one.
const ADD_FOOD_BUTTON_ID = 'meal-add-food'
const SEARCH_FIELD_ID = 'meal-food-search-open'
// The notices of a saved meal just loaded ("Repetir"), which get the focus.
const COPY_NOTICE_ID = 'meal-copy-notice'
// The notice of a correction, which gets the focus when it is loaded.
const CORRECTION_NOTICE_ID = 'meal-correction-notice'

/** The notice after saving, until the next change. */
type SavedNotice = SavedMealResult & {
  /** The meal it corrected, or null. */
  replaced: string | null
  /** What was saved, for "Listo, guardada…" (UX-23). */
  totalCarbsG: number
  appliedDoseUnits: number
}

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
export function MealForm({
  foods,
  referenceFoods,
  settings,
  recentMeals,
}: Props) {
  const tableFoods = useMemo(
    () => referenceFoods.map(tableFoodAsMealFood),
    [referenceFoods],
  )
  const location = useLocation()
  const navigate = useNavigate()
  // The meal kept while the app is open, and the food the photo (or the
  // manual form) sent back, if any (spec §6.6, §14 #61); or a saved meal the
  // detail sent to repeat or correct, which replaces it. Read once, when
  // Inicio opens.
  const [initial] = useState(() => {
    const stored = parseStoredMealDraft(readMealDraft())
    const copy = mealCopyRequest(location.state)
    return copy !== null
      ? copiedMealForm(stored, copy, foods)
      : initialMealForm(stored, foodToAddToMeal(location.state))
  })
  // "Hoy" and "Ayer", and "A esta hora comiste", are worked out when Inicio
  // opens (like the history).
  const [now] = useState(() => new Date())
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
  // The meal just saved ("Comida guardada." or "Comida corregida.", and its
  // link to the history), until the next change.
  const [saved, setSaved] = useState<SavedNotice | null>(null)
  // The saved meal this one corrects ("Corregir", spec §6.7), kept with the
  // meal in progress.
  const [correcting, setCorrecting] = useState(initial.correcting)
  // The key of the meal in progress (spec §7.2), kept with it: saving it
  // again unchanged (a retry) does not create a second meal. Any change to
  // what was entered (items, quantities, dose, date; also emptying it or
  // saving it) makes it another meal, with a new key, adjusted in the
  // render: a retry after editing must not get the meal saved before the
  // edit (spec §14 #85).
  const [clientKey, setClientKey] = useState(initial.clientKey)
  const [keyedMeal, setKeyedMeal] = useState<KeyedMeal>({
    items,
    appliedDoseText,
    eatenAtText,
  })
  const enteredNow: KeyedMeal = { items, appliedDoseText, eatenAtText }
  if (mealChanged(keyedMeal, enteredNow)) {
    setKeyedMeal(enteredNow)
    setClientKey(newClientKey())
  }
  // The notices of a saved meal just loaded ("Repetir" or "Corregir"),
  // until the next change.
  const [copyNotice, setCopyNotice] = useState(initial.copyNotice)
  // The search over the whole screen (UX-08). It has its own entry in the
  // browser history, so "atrás" closes it. It always starts closed: after a
  // reload on that entry (or coming back to the app), the mark is removed.
  const searchInHistory = isFoodSearchState(location.state)
  const [searchOpen, setSearchOpen] = useState(false)
  // What opened the search, to give it the focus back when it closes.
  const searchOpenerRef = useRef(ADD_FOOD_BUTTON_ID)
  // What has the focus when the search closes: going back in the browser
  // history restores the scroll of the entry, so it is shown again then.
  const revealAfterBackRef = useRef<string | null>(null)
  const searchWasInHistoryRef = useRef(false)
  // A "navigate(-1)" that leaves the entry of the search is pending: the
  // search is not opened again until it lands.
  const leavingSearchRef = useRef(false)
  const createMeal = useCreateMeal()
  // A save of this meal that an earlier Inicio started (the user left while
  // it was saving and came back, spec §6.6, §14 #85): while it is in
  // progress the form is saving; when it ends well, the form empties as
  // after its own save (in the render, so the old meal is not shown).
  const [mountedAt] = useState(() => Date.now())
  const otherSave = useOtherMealSave(clientKey, mountedAt)
  const otherSaving = otherSave?.status === 'pending'
  const saving = createMeal.isPending || otherSaving
  // A save is in progress. isPending disables the fieldset only after the
  // next render, so a second tap in the same tick ("Guardar" or "Guardar
  // igual") would create a second meal without this (spec §14 #46).
  const savingRef = useRef(false)
  // A food saved from the photo that could not be added (it still needs how
  // much it yields), until the next change.
  const [notUsableFood, setNotUsableFood] = useState(initial.notUsableFood)

  // The food sent back from the photo (or a saved meal sent by the detail,
  // or the mark of the open search) is used once: the navigation state that
  // carried it is removed, without a new entry (it would survive a reload),
  // and the quantity of the food gets the focus, as when a food is picked in
  // the search, or else the notices of the loaded meal.
  const [fromDetail] = useState(() => mealCopyRequest(location.state) !== null)
  const [addedFromPhoto] = useState(
    () =>
      foodToAddToMeal(location.state) !== null ||
      mealCopyRequest(location.state) !== null ||
      isFoodSearchState(location.state),
  )
  useEffect(() => {
    if (!addedFromPhoto) return
    // preventScrollReset: the new history entry would scroll to the top and
    // hide the item that just got the focus.
    void navigate('/', { replace: true, state: null, preventScrollReset: true })
    if (initial.focusKey !== null) {
      document.getElementById(`meal-item-${initial.focusKey}-quantity`)?.focus()
    } else if (fromDetail) {
      // The notices of a saved meal loaded from the detail, or the notice
      // of the correction.
      ;(
        document.getElementById(COPY_NOTICE_ID) ??
        document.getElementById(CORRECTION_NOTICE_ID)
      )?.focus()
    }
  }, [addedFromPhoto, fromDetail, initial.focusKey, navigate])

  // While the search is open, the bar at the bottom is inert too (outside
  // this component; aria-modal alone does not keep the keyboard out).
  useEffect(() => {
    if (!searchOpen) return
    const bar = document.getElementById(APP_NAV_ID)
    bar?.setAttribute('inert', '')
    return () => bar?.removeAttribute('inert')
  }, [searchOpen])

  // "Atrás" on the open search leaves its entry: the search closes, and what
  // got the focus (the quantity of a picked food, or what opened it) is
  // shown again, because going back restored the scroll of the entry.
  useEffect(() => {
    const was = searchWasInHistoryRef.current
    searchWasInHistoryRef.current = searchInHistory
    if (!was || searchInHistory) return
    leavingSearchRef.current = false
    setSearchOpen(false)
    const reveal = revealAfterBackRef.current
    revealAfterBackRef.current = null
    if (reveal !== null) {
      document.getElementById(reveal)?.scrollIntoView({ block: 'nearest' })
    }
  }, [searchInHistory])

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
            : SEARCH_FIELD_ID
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
    const draft: StoredMealDraft = {
      items,
      appliedDoseText,
      eatenAtText,
      correcting,
      clientKey,
    }
    writeMealDraft(draft)
  }, [items, appliedDoseText, eatenAtText, correcting, clientKey])

  // The save an earlier Inicio started ended well: the same as after a save
  // of this form. reset gives a new key, so this runs once.
  if (otherSave?.status === 'success') {
    const { saved: other, result: otherResult } = otherSave
    reset({
      ...otherResult,
      replaced: other.replaces,
      totalCarbsG: other.record.meal.total_carbs_g,
      appliedDoseUnits: other.record.meal.applied_dose_units,
    })
  }

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
    setSaved(null)
    setNotUsableFood(null)
    setCopyNotice(null)
  }

  // Picked in the search or in "Recientes". The new field has to be in the
  // DOM before focusing it, and the focus has to happen inside the tap: iOS
  // only opens the keyboard that way. The search closes in the same render,
  // and its entry leaves the browser history.
  function handlePick(food: MealFood) {
    touch()
    const key = nextKey.current
    nextKey.current += 1
    const quantityId = `meal-item-${key}-quantity`
    flushSync(() => {
      setItems((current) => [...current, newItemDraft(key, food)])
      setSearchOpen(false)
    })
    document.getElementById(quantityId)?.focus()
    leaveSearchEntry(quantityId)
  }

  // Opens the search over the whole screen, with the focus in its field
  // inside the tap (iOS opens the keyboard only that way, #44), and adds its
  // entry to the browser history (without moving the page).
  function openSearch(openerId: string) {
    if (savingRef.current || otherSaving || leavingSearchRef.current) return
    searchOpenerRef.current = openerId
    flushSync(() => setSearchOpen(true))
    document.getElementById(FOOD_SEARCH_INPUT_ID)?.focus()
    if (!searchInHistory) {
      void navigate('/', { state: FOOD_SEARCH_STATE, preventScrollReset: true })
    }
  }

  // ✕ or Escape: closes without picking; the focus goes back to what opened
  // it.
  function closeSearch() {
    const opener = searchOpenerRef.current
    flushSync(() => setSearchOpen(false))
    document.getElementById(opener)?.focus()
    leaveSearchEntry(opener)
  }

  // Goes back from the entry of the open search, as "atrás" would, so the
  // browser history is left as it was before opening it.
  function leaveSearchEntry(revealId: string) {
    if (!searchInHistory) return
    revealAfterBackRef.current = revealId
    leavingSearchRef.current = true
    void navigate(-1)
  }

  // "Repetir" on a meal of "A esta hora comiste": the same as from the
  // detail (spec §6.6). Inicio has no items here, so nothing is replaced.
  function handleRepeat(meal: RecentMeal) {
    const form = copiedMealForm(
      { items, appliedDoseText, eatenAtText, correcting, clientKey },
      {
        mode: 'repeat',
        mealId: meal.id,
        eatenAt: meal.eaten_at,
        appliedDoseUnits: null,
        items: meal.meal_items,
      },
      foods,
    )
    loadForm(form)
  }

  // Loads a saved meal in the form, with its notices, which get the focus
  // (the button that was tapped is gone).
  function loadForm(form: InitialMealForm) {
    flushSync(() => {
      touch()
      if (form.items.length > 0) {
        setItems(form.items)
        nextKey.current = form.nextKey
        setRemoved(null)
        setShownErrors({})
        setAppliedDoseText(form.appliedDoseText)
        setAppliedDoseShownError(null)
        setEatenAtText(form.eatenAtText)
        setEatenAtShownError(false)
        setCorrecting(form.correcting)
        setClientKey(form.clientKey)
      }
      setCopyNotice(form.copyNotice)
    })
    document.getElementById(COPY_NOTICE_ID)?.focus()
  }

  // "Cancelar la corrección": Inicio empties, and the corrected meal is
  // shown again, untouched.
  function cancelCorrection() {
    if (correcting === null) return
    clearMealDraft()
    void navigate(`/history/${correcting.mealId}`)
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
      // A meal left without items is no longer a correction (spec §6.7).
      if (next.items.length === 0) setCorrecting(null)
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

  // After a save: an empty form and "Comida guardada." (or "Comida
  // corregida."), with the id that saveMeal returned.
  function reset(notice: SavedNotice) {
    setItems([])
    setRemoved(null)
    setShownErrors({})
    setAppliedDoseText(null)
    setAppliedDoseShownError(null)
    setEatenAtText(null)
    setEatenAtShownError(false)
    setCorrecting(null)
    // Right away (the change of the meal gives another one too, a render
    // later): the save of an earlier Inicio must stop matching.
    setClientKey(newClientKey())
    setSaved(notice)
  }

  function save() {
    if (savingRef.current || otherSaving) return
    if (!result.ok) return
    // Correcting, the date and the dose as they were loaded save the exact
    // values of the corrected meal (spec §6.7).
    const applied = appliedDose(
      appliedDoseText,
      result.doseUnits,
      correcting?.appliedDose ?? null,
    )
    if ('error' in applied) return
    const eatenAt = eatenAtToSave(
      eatenAtText,
      new Date(),
      correcting === null
        ? null
        : { text: correcting.eatenAtText, value: correcting.eatenAt },
    )
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
    // A correction creates the new meal and then deletes the corrected one
    // (saveMeal, spec §6.7), with the same key as any other meal.
    const replaces = correcting?.mealId ?? null
    savingRef.current = true
    createMeal.mutate(
      { record, replaces, clientKey },
      {
        onSuccess: (savedMeal) =>
          reset({
            ...savedMeal,
            replaced: replaces,
            totalCarbsG: record.meal.total_carbs_g,
            appliedDoseUnits: applied.value,
          }),
        onSettled: () => {
          savingRef.current = false
        },
      },
    )
  }

  function handleSave() {
    // A tap on "Guardar" right after "Guardar igual" must not reopen the
    // confirmation while the meal is being saved.
    if (savingRef.current || otherSaving) return
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
  // The shortcuts of an empty Inicio (UX-08, UX-09), from the last meals and
  // today's catalog.
  const recents = useMemo(
    () => recentFoods(recentMeals ?? [], foods),
    [recentMeals, foods],
  )
  const suggestions = useMemo(
    () => (recentMeals === undefined ? null : suggestedMeals(recentMeals, now)),
    [recentMeals, now],
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
        className={`flex items-center justify-between gap-3 rounded-card border border-dashed border-line-strong bg-sunken py-1 pr-2 pl-4 ${enter}`}
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

  // "Con foto" opens the camera or the gallery in the same tap (UX-16); the
  // photo screen starts with the photo picked, comes back here after saving
  // and the food is added to the meal (spec §6.1, §14 #61). While saving,
  // the fieldset disables its input.
  const photoButton = (
    <PhotoPickerButton
      label="Con foto"
      accessibleName="Agregar con foto"
      variant="secondary"
      className="shrink-0"
      onFile={(file) => {
        if (savingRef.current || otherSaving) return
        void navigate('/foods/label', {
          state: { ...FROM_MEAL_STATE, ...holdLabelPhoto(file) },
        })
      }}
    />
  )

  return (
    // What gets the focus scrolls into view below the dose display, which
    // stays stuck to the top (WCAG 2.4.11): the display is at most about
    // 13rem tall, and 5rem more leave the name of a food in grams (or the
    // "1 alfajor = 50 g" hint of one in units) in sight.
    <>
      <h1 className={pageTitle}>
        {correcting !== null
          ? 'Corregir comida'
          : items.length === 0
            ? EMPTY_MEAL_TITLE
            : 'Nueva comida'}
      </h1>
      {/* While the search is open over the whole screen, the rest of the
          page is inert (the bar too, in an effect). */}
      <fieldset
        className="flex min-w-0 flex-col gap-4 [&_:is(input,button,a,select)]:scroll-mt-[calc(18rem+env(safe-area-inset-top))]"
        disabled={saving}
        inert={searchOpen}
      >
        {/* Fixed until saving or cancelling, with the items not brought. */}
        {correcting !== null && (
          <div id={CORRECTION_NOTICE_ID} tabIndex={-1}>
            <Notice tone="info">
              <p>
                {`Estás corrigiendo la comida ${ofMealMoment(correcting.eatenAt, now)}. Al guardar, reemplaza a la anterior. Se usan los valores de hoy de cada alimento.`}
              </p>
              {correcting.skipped.length > 0 && (
                <p>
                  {`Al guardar, la comida nueva no va a tener: ${correcting.skipped.map((item) => `"${item.foodName}"`).join(', ')}.`}
                </p>
              )}
              <button
                type="button"
                className={`${button.text} self-start`}
                onClick={cancelCorrection}
              >
                Cancelar la corrección
              </button>
            </Notice>
          </div>
        )}

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

        {saved !== null &&
          (saved.replacedDeleted === false && saved.replaced !== null ? (
            <Notice tone="warning">
              <p role="status">{CORRECTION_DELETE_ERROR_MESSAGE}</p>
              <Link
                to={`/history/${saved.replaced}`}
                className={`${button.text} self-start`}
              >
                Ir a la comida anterior
              </Link>
            </Notice>
          ) : (
            <Notice tone="success">
              <p role="status">
                {savedMealText(
                  saved.totalCarbsG,
                  saved.appliedDoseUnits,
                  saved.replaced !== null,
                )}
              </p>
              <Link
                to={`/history/${saved.id}`}
                className={`${button.text} self-start`}
              >
                Ver en el historial
              </Link>
            </Notice>
          ))}

        {copyNotice !== null &&
          (copyNotice.repeatedFrom !== null ||
            copyNotice.skipped.length > 0) && (
            <div
              id={COPY_NOTICE_ID}
              tabIndex={-1}
              role="status"
              className="flex flex-col gap-3"
            >
              {copyNotice.repeatedFrom !== null && (
                <Notice tone="info">
                  <p>
                    {`Copiaste la comida ${ofMealMoment(copyNotice.repeatedFrom, now)}. Revisá las cantidades antes de guardar.`}
                  </p>
                </Notice>
              )}
              {copyNotice.skipped.length > 0 && (
                <Notice tone="warning">
                  {copyNotice.skipped.map((item, index) => (
                    <p key={index}>
                      {mealCopySkipMessage(item.foodName, item.reason)}
                    </p>
                  ))}
                </Notice>
              )}
            </div>
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
                  warnings={itemWarnings(
                    item,
                    result.items[index],
                    settings,
                  ).map(mealLiveWarningMessage)}
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

        {/* "+ Agregar alimento" (soft) and "Con foto" (secondary), on one line
          under the items, where the next one goes (UX-06). Without items,
          the search field comes first, with "Con foto" at its right, and
          under them the shortcuts (UX-08, UX-09). Both the button and the
          field open the search over the whole screen. */}
        {items.length > 0 ? (
          <div className="flex gap-3">
            <button
              id={ADD_FOOD_BUTTON_ID}
              type="button"
              aria-haspopup="dialog"
              className={`${button.soft} min-w-0 flex-1`}
              onClick={() => openSearch(ADD_FOOD_BUTTON_ID)}
            >
              <Plus aria-hidden="true" className="shrink-0" />
              Agregar alimento
            </button>
            {photoButton}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className={fieldLabel}>Agregar alimento</span>
              <div className="flex gap-3">
                <button
                  id={SEARCH_FIELD_ID}
                  type="button"
                  aria-haspopup="dialog"
                  className={`${field} flex min-w-0 flex-1 items-center gap-2 text-left`}
                  onClick={() => openSearch(SEARCH_FIELD_ID)}
                >
                  <Search
                    aria-hidden="true"
                    className="shrink-0 text-ink-soft"
                  />
                  <span className="truncate text-ink-soft">
                    Buscar alimento
                  </span>
                </button>
                {photoButton}
              </div>
            </div>
            <RecentFoods foods={recents} onPick={handlePick} />
            {suggestions !== null && (
              <MealSuggestions
                suggestions={suggestions}
                now={now}
                onRepeat={handleRepeat}
              />
            )}
          </div>
        )}

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
                  <span className={fieldLabel}>¿Cuándo?</span>
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
                    ¿Cuándo?
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
                      setEatenAtShownError(
                        eatenAtFromInput(eatenAtText) === null,
                      )
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
                  {saving ? 'Guardando…' : 'Guardar comida'}
                </button>
              </>
            )}
          </div>
        )}
      </fieldset>

      {/* Outside the fieldset: the margin that keeps what gets the focus
        below the dose display does not apply over the whole screen. */}
      {searchOpen && (
        <FoodSearchSheet
          foods={foods}
          tableFoods={tableFoods}
          recents={recents}
          onPick={handlePick}
          onClose={closeSearch}
        />
      )}
    </>
  )
}
