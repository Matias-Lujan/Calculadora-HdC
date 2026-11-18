import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { foodsKeys } from '../../lib/foods.ts'
import { clearMealDraft } from '../../lib/mealDraftStorage.ts'
import {
  deleteMeal,
  fetchMeal,
  fetchMealsPage,
  fetchRecentMeals,
  fetchReferenceFoods,
  saveMeal,
} from './api.ts'
import { nextMealsOffset, withoutMeal } from './history.ts'
import type { MealsPage } from './types.ts'

export const mealsKeys = {
  all: ['meals'] as const,
  list: ['meals', 'list'] as const,
  detail: (id: string) => ['meals', 'detail', id] as const,
  // The last meals, for the shortcuts of an empty Inicio (spec §6.6).
  recent: ['meals', 'recent'] as const,
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
export function useCreateMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveMeal,
    onSuccess: () => {
      clearMealDraft()
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
// The shortcuts of Inicio are read again too.
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
      ])
    },
  })
}
