import {
  InfiniteQueryObserver,
  QueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextMealsOffset } from './history.ts'
import { mealListOptions, mealsKeys, useMealList } from './queries.ts'
import type { MealsPage } from './types.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))

// Only useInfiniteQuery is replaced (to see what useMealList passes it);
// QueryClient and InfiniteQueryObserver stay the real ones.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useInfiniteQuery: vi.fn(),
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
