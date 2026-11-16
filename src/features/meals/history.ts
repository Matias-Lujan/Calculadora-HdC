import type { InfiniteData } from '@tanstack/react-query'
import { z } from 'zod'
import { formatCarbs, formatDose, sumCarbs } from '../../domain/dose/index.ts'
import { eatenDay } from './eatenAt.ts'
import type { ListedMeal, MealSummary, MealsPage } from './types.ts'

// Pure logic of the history (spec §6.7, §14 #47 and #62): the paging of the
// list, its days, its texts and how the detail knows it was opened from the
// list. It does no math of its own: the day totals are added up and the
// numbers formatted with src/domain/dose.

/**
 * Whether the detail was opened from a row of the list, which links with
 * the location state `{ fromHistory: true }`. Then "← Historial" goes back
 * in the browser history, so the list recovers its scroll. `state` is
 * whatever the browser history holds (react-router types it as `any`).
 */
export function isFromHistoryList(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'fromHistory' in state &&
    state.fromHistory === true
  )
}

/** The parts of a click that say whether the browser should handle it. */
export type ClickModifiers = {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Whether a click on a link is a plain left click, the only one "← Historial"
 * turns into going back. With Ctrl, Cmd, Shift or Alt, or another button,
 * the link acts as usual (a new tab or window with /history), as
 * shouldProcessLinkClick of react-router does.
 */
export function isPlainLeftClick(click: ClickModifiers): boolean {
  return (
    click.button === 0 &&
    !click.metaKey &&
    !click.ctrlKey &&
    !click.shiftKey &&
    !click.altKey
  )
}

/**
 * The offset of the next page of the list (getNextPageParam): the number of
 * meals already loaded, or undefined if the last page was the last one.
 */
export function nextMealsOffset(
  lastPage: MealsPage,
  allPages: MealsPage[],
): number | undefined {
  if (!lastPage.hasMore) return undefined
  return allPages.reduce((count, page) => count + page.meals.length, 0)
}

/**
 * The list without a meal, from every page, keeping the page params and
 * `hasMore`. Does not modify `data`. With the meal removed, the next offset
 * is one less, as on the server once it was deleted.
 */
export function withoutMeal(
  data: InfiniteData<MealsPage, number>,
  id: string,
): InfiniteData<MealsPage, number> {
  return {
    pages: data.pages.map((page) => ({
      meals: page.meals.filter((meal) => meal.id !== id),
      hasMore: page.hasMore,
    })),
    pageParams: [...data.pageParams],
  }
}

/** The applied dose, "8,50 U", or "—" if there is none. */
export function appliedDoseText(units: number | null): string {
  return units === null ? '—' : `${formatDose(units)} U`
}

/** "HC 128,2 g · Dosis 8,55 U · Aplicada 8,50 U". */
export function mealSummaryText(meal: MealSummary): string {
  return `HC ${formatCarbs(meal.total_carbs_g)} g · Dosis ${formatDose(meal.calculated_dose_units)} U · Aplicada ${appliedDoseText(meal.applied_dose_units)}`
}

/**
 * The names of the foods of a meal, in the order they were entered
 * (`position`), as they were saved: "Arroz, Pollo, Manzana".
 */
export function mealFoodsText(meal: ListedMeal): string {
  return meal.meal_items
    .toSorted((a, b) => a.position - b.position)
    .map((item) => item.food_name)
    .join(', ')
}

/** A day of the history list, with its meals in the order of the list. */
export type MealDay = {
  /** The day of Buenos Aires, "YYYY-MM-DD" (eatenDay). */
  day: string
  meals: ListedMeal[]
  /**
   * False if the next page can still have meals of this day: then its count
   * and total are not shown, because they could be incomplete.
   */
  complete: boolean
}

/**
 * The meals loaded, grouped by the day of Buenos Aires they were eaten in,
 * in the order of the list (most recent first). With `hasMore` (there is a
 * next page), the day of the last meal loaded may go on in it, so it is not
 * complete; every other day is. Does not modify `meals`.
 */
export function groupMealsByDay(
  meals: readonly ListedMeal[],
  hasMore: boolean,
): MealDay[] {
  const days = new Map<string, ListedMeal[]>()
  for (const meal of meals) {
    const day = eatenDay(meal.eaten_at)
    const group = days.get(day)
    if (group === undefined) days.set(day, [meal])
    else group.push(meal)
  }
  const last = meals.at(-1)
  const openDay = hasMore && last !== undefined ? eatenDay(last.eaten_at) : null
  return [...days].map(([day, dayMeals]) => ({
    day,
    meals: dayMeals,
    complete: day !== openDay,
  }))
}

/**
 * The count and total of a day: "3 comidas · 185,0 g de HC" ("1 comida").
 * Null if the day is not complete. The total is added up in the domain
 * (sumCarbs); if it can't be shown, only the count.
 */
export function daySummaryText(day: MealDay): string | null {
  if (!day.complete) return null
  const count =
    day.meals.length === 1 ? '1 comida' : `${day.meals.length} comidas`
  const total = sumCarbs(day.meals.map((meal) => meal.total_carbs_g))
  return total === null ? count : `${count} · ${formatCarbs(total)} g de HC`
}

const openDaysStateSchema = z.object({ openDays: z.array(z.string()) })

/**
 * The days open in the list, kept in the state of its entry of the browser
 * history (`{ openDays: [...] }`), so going back from a meal finds them open
 * and the scroll lands where it was. Anything else (the bar, a typed URL,
 * after deleting) gives none: every day folded.
 */
export function openDaysFromState(state: unknown): string[] {
  const parsed = openDaysStateSchema.safeParse(state)
  return parsed.success ? parsed.data.openDays : []
}

/** The open days with `day` opened, or folded if it was open. */
export function toggledDays(open: readonly string[], day: string): string[] {
  return open.includes(day) ? open.filter((d) => d !== day) : [...open, day]
}
