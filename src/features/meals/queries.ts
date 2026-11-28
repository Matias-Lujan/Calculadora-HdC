import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type MutationState,
} from '@tanstack/react-query'
import { GlucoseError } from '../../lib/errors.ts'
import { foodsKeys } from '../../lib/foods.ts'
import { clearMealDraftOf } from '../../lib/mealDraftStorage.ts'
import {
  deleteMeal,
  fetchDayMealTimes,
  fetchGlucoseDay,
  fetchMeal,
  fetchLatestGlucose,
  fetchMealsPage,
  fetchRecentMeals,
  fetchReferenceFoods,
  saveMeal,
} from './api.ts'
import { nextMealsOffset, withoutMeal } from './history.ts'
import type { MealToSave, MealsPage, SavedMealResult } from './types.ts'

export const mealsKeys = {
  all: ['meals'] as const,
  list: ['meals', 'list'] as const,
  detail: (id: string) => ['meals', 'detail', id] as const,
  // The last meals, for the shortcuts of an empty Inicio (spec §6.6).
  recent: ['meals', 'recent'] as const,
  // The times of the meals of the last 24 hours, for the marks of the
  // glucose chart (spec §6.10): saving or deleting a meal reads them again.
  glucoseMarks: ['meals', 'glucose-marks'] as const,
}

// Outside mealsKeys.all on purpose: saving a meal invalidates that prefix,
// and the table does not change with a meal.
export const referenceFoodsKey = ['reference-foods'] as const

/**
 * The reference table, read once: it only changes with a migration, so it
 * is never stale while the app is open.
 */
export const referenceFoodsOptions = queryOptions({
  queryKey: referenceFoodsKey,
  queryFn: fetchReferenceFoods,
  staleTime: Infinity,
})

export function useReferenceFoods() {
  return useQuery(referenceFoodsOptions)
}

// No optimistic updates (CLAUDE.md): "Comida guardada." is shown only when
// the server confirms. A 401 is handled by the global MutationCache. Saving
// can copy reference table foods to the catalog (spec §6.2), so the catalog
// list is read again too. The meal kept while the app is open is cleared
// here, and not only by the form: this runs even if the user left Inicio
// while saving, so a saved meal is never restored (spec §6.6, §14 #61).
// It also saves a correction (saveMeal): the corrected meal leaves the
// history and the shortcuts of Inicio with the same invalidation.
// Its key lets an Inicio opened while a save of its meal is in progress
// find it (useOtherMealSave).
export function useCreateMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: saveMealKey,
    mutationFn: saveMeal,
    // Only if the kept draft is still this meal: one loaded meanwhile stays.
    onSuccess: (_, { clientKey }) => {
      clearMealDraftOf(clientKey)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: mealsKeys.all }),
        queryClient.invalidateQueries({ queryKey: foodsKeys.list }),
      ])
    },
  })
}

/**
 * The history list, in pages of MEALS_PAGE_SIZE ("Ver más"). An infinite
 * query (paged reading), not useQuery with a growing limit: Supabase cuts a
 * response at 1000 rows, and each request here asks for at most 51. On a
 * refetch, react-query reads the pages again from the first one,
 * recomputing each offset with nextMealsOffset (spec §14 #47).
 */
export const mealListOptions = infiniteQueryOptions({
  queryKey: mealsKeys.list,
  queryFn: ({ pageParam }) => fetchMealsPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: nextMealsOffset,
  // The list is inactive while a meal is shown. With the default gcTime
  // (5 minutes) it was removed from the cache by then, and "← Historial"
  // read it again and opened it at the top, losing the scroll.
  gcTime: 30 * 60 * 1000,
})

export function useMealList() {
  return useInfiniteQuery(mealListOptions)
}

/**
 * The last meals, for "Recientes" and "A esta hora comiste" (spec §6.6).
 * Under the meals prefix: saving a meal reads them again.
 */
export function useRecentMeals() {
  return useQuery({ queryKey: mealsKeys.recent, queryFn: fetchRecentMeals })
}

export function useMeal(id: string) {
  return useQuery({
    queryKey: mealsKeys.detail(id),
    queryFn: () => fetchMeal(id),
  })
}

// Runs after the server confirmed (not optimistic). The list is inactive
// while the detail is shown, so the deleted meal is removed from its cache
// too (otherwise, going back would show it until the list is read again),
// and the list is read again. The detail being shown is not invalidated: it
// would show "No encontramos esta comida." before navigating to the list.
// The shortcuts of Inicio and the marks of the glucose chart are read
// again too.
export function useDeleteMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteMeal,
    onSuccess: (_: void, id: string) => {
      queryClient.setQueryData<InfiniteData<MealsPage, number>>(
        mealsKeys.list,
        (old) => old && withoutMeal(old, id),
      )
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: mealsKeys.list }),
        queryClient.invalidateQueries({ queryKey: mealsKeys.recent }),
        queryClient.invalidateQueries({ queryKey: mealsKeys.glucoseMarks }),
      ])
    },
  })
}

/** The key of the saves of a meal (useCreateMeal). */
export const saveMealKey = ['save-meal'] as const

/** What is read of each save of a meal in the mutation cache. */
export type MealSaveSnapshot = Pick<
  MutationState<SavedMealResult, unknown, MealToSave>,
  'status' | 'variables' | 'data' | 'submittedAt'
>

/**
 * A save of the meal in progress that another Inicio started (spec §6.6,
 * §14 #85): pending, done (with what was saved and its result), or none.
 */
export type OtherMealSave =
  | { status: 'pending' }
  | { status: 'success'; saved: MealToSave; result: SavedMealResult }
  | null

/**
 * Among the saves of the cache, the ones of the meal with `clientKey` that
 * started before this Inicio opened (`mountedAt`; its own saves start after
 * it). One that ended well wins: the meal is saved. Failed ones count as
 * none, so the meal stays to retry.
 */
export function otherMealSave(
  saves: readonly MealSaveSnapshot[],
  clientKey: string,
  mountedAt: number,
): OtherMealSave {
  const ofThisMeal = saves.filter(
    (save) =>
      save.submittedAt < mountedAt && save.variables?.clientKey === clientKey,
  )
  for (const save of ofThisMeal) {
    if (
      save.status === 'success' &&
      save.variables !== undefined &&
      save.data !== undefined
    ) {
      return { status: 'success', saved: save.variables, result: save.data }
    }
  }
  return ofThisMeal.some((save) => save.status === 'pending')
    ? { status: 'pending' }
    : null
}

/**
 * The save of the meal in progress started by an Inicio that is no longer
 * open (the user left while it was saving and came back, spec §6.6): the
 * form shows it as saving and, when it ends well, empties as after its own
 * save.
 */
export function useOtherMealSave(
  clientKey: string,
  mountedAt: number,
): OtherMealSave {
  const saves = useMutationState({
    filters: { mutationKey: saveMealKey },
    select: (mutation): MealSaveSnapshot => {
      const { status, variables, data, submittedAt } = mutation.state
      return {
        status,
        // Only useCreateMeal uses this key, with saveMeal.
        variables: variables as MealToSave | undefined,
        data: data as SavedMealResult | undefined,
        submittedAt,
      }
    },
  })
  return otherMealSave(saves, clientKey, mountedAt)
}

export const glucoseKeys = {
  // The last reading of the sensor (spec §6.9). Outside mealsKeys.all:
  // saving a meal does not change it.
  latest: ['glucose', 'latest'] as const,
  // The saved readings of the last 24 hours, for the chart and the small
  // curve of the glucose card on Home (spec §6.9 and §6.10).
  day: ['glucose', 'day'] as const,
}

/** How often the glucose is read again while Inicio is in sight. */
export const GLUCOSE_REFETCH_MS = 60_000

/**
 * Every minute, also after an error. The errors of the LibreLink account
 * (wrong password, terms to accept, not shared) keep it going too, so the
 * box gets well on its own once the user fixes them: the function logs in
 * once every 15 min at most, whatever the app asks. Only a user without
 * the glucose set up stops it.
 */
export function glucoseRefetchInterval(error: unknown): number | false {
  if (error instanceof GlucoseError && error.code === 'GLUCOSE_NOT_CONFIGURED')
    return false
  return GLUCOSE_REFETCH_MS
}

/**
 * The last reading of the sensor, read again every minute while the app is
 * in sight and when going back to it (refetchOnWindowFocus, on by
 * default). Without retries: the next minute is the retry, and each one
 * could log in to LibreLinkUp. A 401 goes to the login (global QueryCache).
 */
export function useLatestGlucose() {
  return useQuery({
    queryKey: glucoseKeys.latest,
    queryFn: fetchLatestGlucose,
    refetchInterval: (query) => glucoseRefetchInterval(query.state.error),
    refetchIntervalInBackground: false,
    retry: false,
  })
}

/** How often the saved readings are read again while Home or the chart is in sight. */
export const GLUCOSE_DAY_REFETCH_MS = 5 * 60_000

/**
 * The saved readings of the last 24 hours (spec §6.9 and §6.10), used by the
 * chart and by the small curve on Home (also for a user without glucose: it
 * comes back empty). Read again every 5 min while either is in sight and
 * when going back to it
 * (refetchOnWindowFocus, on by default): they are saved every 15 min at
 * most. A 401 goes to the login (global QueryCache).
 */
export function useGlucoseDay() {
  return useQuery({
    queryKey: glucoseKeys.day,
    queryFn: fetchGlucoseDay,
    refetchInterval: GLUCOSE_DAY_REFETCH_MS,
    refetchIntervalInBackground: false,
  })
}

/**
 * The times of the meals of the last 24 hours, for the marks of the chart.
 * Under the meals prefix: saving a meal reads them again.
 */
export function useMealMarks() {
  return useQuery({
    queryKey: mealsKeys.glucoseMarks,
    queryFn: fetchDayMealTimes,
  })
}
