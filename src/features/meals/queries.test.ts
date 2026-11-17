import {
  InfiniteQueryObserver,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextMealsOffset } from './history.ts'
import { foodsKeys } from '../../lib/foods.ts'
import { clearMealDraft } from '../../lib/mealDraftStorage.ts'
import { createMeal, fetchReferenceFoods } from './api.ts'
import {
  mealListOptions,
  mealsKeys,
  referenceFoodsKey,
  referenceFoodsOptions,
  useCreateMeal,
  useMealList,
  useReferenceFoods,
} from './queries.ts'
import type { MealsPage } from './types.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('../../lib/mealDraftStorage.ts', () => ({ clearMealDraft: vi.fn() }))

// Only the hooks are replaced (to see what each hook passes them);
// QueryClient and InfiniteQueryObserver stay the real ones.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useInfiniteQuery: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}))

const MINUTE = 60 * 1000

describe('mealListOptions', () => {
  it('the options of the list', () => {
    expect(mealListOptions.queryKey).toEqual(mealsKeys.list)
    expect(mealListOptions.initialPageParam).toBe(0)
    expect(mealListOptions.getNextPageParam).toBe(nextMealsOffset)
    expect(mealListOptions.gcTime).toBe(30 * MINUTE)
  })
})

// The list stays in memory while a meal is shown (spec §6.7 "Scroll", §14
// #47 (10)), with a real QueryClient. Under Node, react-query's default
// gcTime is Infinity, so the removal at 30 minutes comes from the option.
describe('the list in the cache while a meal is shown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays 30 minutes after the list stops being shown, then is removed', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const empty: MealsPage = { meals: [], hasMore: false }
    const observer = new InfiniteQueryObserver(client, {
      ...mealListOptions,
      queryFn: () => Promise.resolve(empty),
    })

    const stopShowing = observer.subscribe(() => {}) // the list is shown
    await vi.advanceTimersByTimeAsync(0)
    expect(client.getQueryData(mealsKeys.list)).toBeDefined()

    stopShowing() // a meal is opened
    await vi.advanceTimersByTimeAsync(29 * MINUTE)
    expect(client.getQueryData(mealsKeys.list)).toBeDefined()

    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(client.getQueryData(mealsKeys.list)).toBeUndefined()
  })
})

// --- Added by the tester ---

describe('useMealList', () => {
  it('reads the list with mealListOptions (the 30-minute gcTime included)', () => {
    vi.mocked(useInfiniteQuery).mockClear()
    useMealList()
    expect(useInfiniteQuery).toHaveBeenCalledTimes(1)
    expect(vi.mocked(useInfiniteQuery).mock.calls[0]?.[0]).toBe(mealListOptions)
  })
})

describe('useReferenceFoods', () => {
  it('reads the table once, with its own key, never stale', () => {
    expect(referenceFoodsOptions.queryKey).toEqual(['reference-foods'])
    expect(referenceFoodsOptions.queryKey).toBe(referenceFoodsKey)
    expect(referenceFoodsOptions.queryFn).toBe(fetchReferenceFoods)
    expect(referenceFoodsOptions.staleTime).toBe(Infinity)

    vi.mocked(useQuery).mockClear()
    useReferenceFoods()
    expect(useQuery).toHaveBeenCalledTimes(1)
    expect(vi.mocked(useQuery).mock.calls[0]?.[0]).toBe(referenceFoodsOptions)
  })

  it('its key is outside the meals prefix, so saving a meal does not read it again', () => {
    expect(referenceFoodsKey[0]).not.toBe(mealsKeys.all[0])
  })
})

describe('useCreateMeal', () => {
  it('after saving, clears the kept meal and reads again the meals and the catalog list', async () => {
    const client = new QueryClient()
    const invalidate = vi
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)
    vi.mocked(useQueryClient).mockReturnValue(client)
    vi.mocked(useMutation).mockClear()
    vi.mocked(clearMealDraft).mockClear()

    useCreateMeal()
    const options = vi.mocked(useMutation).mock.calls[0]?.[0]
    expect(options?.mutationFn).toBe(createMeal)
    await options?.onSuccess?.(
      'id' as never,
      undefined as never,
      undefined as never,
      undefined as never,
    )
    expect(invalidate.mock.calls.map((call) => call[0])).toEqual([
      { queryKey: mealsKeys.all },
      { queryKey: foodsKeys.list },
    ])
    expect(clearMealDraft).toHaveBeenCalledTimes(1)
  })

  it('keeps the meal if saving fails (onSuccess only)', () => {
    vi.mocked(useQueryClient).mockReturnValue(new QueryClient())
    vi.mocked(useMutation).mockClear()
    useCreateMeal()
    const options = vi.mocked(useMutation).mock.calls[0]?.[0]
    expect(options?.onError).toBeUndefined()
    expect(options?.onSettled).toBeUndefined()
  })
})
