import type { InfiniteData } from '@tanstack/react-query'
import { formatCarbs, formatDose } from '../../domain/dose/index.ts'
import type { MealSummary, MealsPage } from './types.ts'

// Pure logic of the history (spec §6.7, §14 #47): the paging of the list,
// its texts and how the detail knows it was opened from the list. It does
// no math of its own: the numbers are formatted with src/domain/dose.

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
