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
import { GlucoseError } from '../../lib/errors.ts'
import { foodsKeys } from '../../lib/foods.ts'
import { clearMealDraftOf } from '../../lib/mealDraftStorage.ts'
import {
  deleteMeal,
  fetchLatestGlucose,
  fetchRecentMeals,
  fetchReferenceFoods,
  saveMeal,
} from './api.ts'
import {
  GLUCOSE_REFETCH_MS,
  glucoseKeys,
  glucoseRefetchInterval,
  mealListOptions,
  mealsKeys,
  otherMealSave,
  referenceFoodsKey,
  saveMealKey,
  referenceFoodsOptions,
  useCreateMeal,
  useDeleteMeal,
  useLatestGlucose,
  useMealList,
  useRecentMeals,
  useReferenceFoods,
} from './queries.ts'
import type { MealToSave, MealsPage } from './types.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('../../lib/mealDraftStorage.ts', () => ({
  clearMealDraftOf: vi.fn(),
}))

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
  it('after saving, clears the kept meal (if it is that one) and reads again the meals and the catalog list', async () => {
    const client = new QueryClient()
    const invalidate = vi
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)
    vi.mocked(useQueryClient).mockReturnValue(client)
    vi.mocked(useMutation).mockClear()
    vi.mocked(clearMealDraftOf).mockClear()

    useCreateMeal()
    const options = vi.mocked(useMutation).mock.calls[0]?.[0]
    expect(options?.mutationFn).toBe(saveMeal)
    expect(options?.mutationKey).toEqual(saveMealKey)
    await options?.onSuccess?.(
      'id' as never,
      { clientKey: '00000000-0000-4000-8000-0000000000cc' } as never,
      undefined as never,
      undefined as never,
    )
    expect(invalidate.mock.calls.map((call) => call[0])).toEqual([
      { queryKey: mealsKeys.all },
      { queryKey: foodsKeys.list },
    ])
    // Only the draft of the meal saved (its key).
    expect(vi.mocked(clearMealDraftOf).mock.calls).toEqual([
      ['00000000-0000-4000-8000-0000000000cc'],
    ])
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

describe('useRecentMeals', () => {
  it('reads the last meals under the meals prefix, so saving reads them again', () => {
    expect(mealsKeys.recent[0]).toBe(mealsKeys.all[0])
    vi.mocked(useQuery).mockClear()
    useRecentMeals()
    expect(vi.mocked(useQuery).mock.calls[0]?.[0]).toEqual({
      queryKey: mealsKeys.recent,
      queryFn: fetchRecentMeals,
    })
  })
})

describe('useDeleteMeal', () => {
  it('after deleting, reads again the list and the shortcuts of Inicio, not the detail', async () => {
    const client = new QueryClient()
    const invalidate = vi
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)
    vi.mocked(useQueryClient).mockReturnValue(client)
    vi.mocked(useMutation).mockClear()

    useDeleteMeal()
    const options = vi.mocked(useMutation).mock.calls[0]?.[0]
    expect(options?.mutationFn).toBe(deleteMeal)
    await options?.onSuccess?.(
      undefined as never,
      'id' as never,
      undefined as never,
      undefined as never,
    )
    expect(invalidate.mock.calls.map((call) => call[0])).toEqual([
      { queryKey: mealsKeys.list },
      { queryKey: mealsKeys.recent },
    ])
  })
})

// A save of the meal in progress started by an Inicio that is no longer open
// (spec §6.6, §14 #85).
describe('otherMealSave', () => {
  const KEY = '00000000-0000-4000-8000-0000000000cc'
  const OTHER_KEY = '00000000-0000-4000-8000-0000000000dd'
  const MOUNTED_AT = 1_000_000
  const result = {
    id: '00000000-0000-4000-8000-0000000000aa',
    replacedDeleted: null,
  }
  const variables = (clientKey: string): MealToSave => ({
    record: {
      meal: {
        eaten_at: '2026-11-14T16:05:00.000Z',
        carb_ratio_g_per_unit: 15,
        total_carbs_g: 75,
        calculated_dose_units: 5,
        applied_dose_units: 5,
        calc_version: '2',
      },
      items: [],
    },
    replaces: null,
    clientKey,
  })
  const pending = (clientKey = KEY, submittedAt = MOUNTED_AT - 1) => ({
    status: 'pending' as const,
    variables: variables(clientKey),
    data: undefined,
    submittedAt,
  })
  const success = (clientKey = KEY, submittedAt = MOUNTED_AT - 1) => ({
    status: 'success' as const,
    variables: variables(clientKey),
    data: result,
    submittedAt,
  })

  it('none without saves', () => {
    expect(otherMealSave([], KEY, MOUNTED_AT)).toBeNull()
  })

  it('a save of this meal in progress, started before this Inicio opened', () => {
    expect(otherMealSave([pending()], KEY, MOUNTED_AT)).toEqual({
      status: 'pending',
    })
  })

  it('a save of this meal that ended well gives what was saved and its result', () => {
    expect(otherMealSave([success()], KEY, MOUNTED_AT)).toEqual({
      status: 'success',
      saved: variables(KEY),
      result,
    })
  })

  it('ended well wins over another one still in progress', () => {
    expect(otherMealSave([pending(), success()], KEY, MOUNTED_AT)?.status).toBe(
      'success',
    )
  })

  it('a failed one counts as none: the meal stays to retry', () => {
    const failed = { ...pending(), status: 'error' as const }
    expect(otherMealSave([failed], KEY, MOUNTED_AT)).toBeNull()
  })

  it('a save of another meal (another key) is not this one', () => {
    expect(
      otherMealSave([pending(OTHER_KEY), success(OTHER_KEY)], KEY, MOUNTED_AT),
    ).toBeNull()
  })

  it('the saves of this Inicio itself (started after it opened) do not count', () => {
    expect(
      otherMealSave(
        [pending(KEY, MOUNTED_AT), success(KEY, MOUNTED_AT + 5)],
        KEY,
        MOUNTED_AT,
      ),
    ).toBeNull()
  })

  it('a save still idle, without variables, is ignored', () => {
    expect(
      otherMealSave(
        [
          {
            status: 'idle',
            variables: undefined,
            data: undefined,
            submittedAt: 0,
          },
        ],
        KEY,
        MOUNTED_AT,
      ),
    ).toBeNull()
  })
})

describe('glucoseRefetchInterval', () => {
  it('every minute without an error, or after one that may be momentary', () => {
    expect(GLUCOSE_REFETCH_MS).toBe(MINUTE)
    expect(glucoseRefetchInterval(null)).toBe(MINUTE)
    expect(
      glucoseRefetchInterval(new GlucoseError('GLUCOSE_UNAVAILABLE', true)),
    ).toBe(MINUTE)
    // A network error or an INTERNAL_ERROR: unexpected, read again.
    expect(glucoseRefetchInterval(new TypeError('Failed to fetch'))).toBe(
      MINUTE,
    )
  })

  it.each([
    'GLUCOSE_NOT_CONFIGURED',
    'GLUCOSE_LOGIN_FAILED',
    'GLUCOSE_ACTION_NEEDED',
    'GLUCOSE_NOT_SHARED',
  ] as const)('stops after %s, which is not retryable', (code) => {
    expect(glucoseRefetchInterval(new GlucoseError(code, false))).toBe(false)
  })
})

describe('useLatestGlucose', () => {
  it('reads every minute only in sight, without retries, outside the meals prefix', () => {
    expect(glucoseKeys.latest[0]).not.toBe(mealsKeys.all[0])
    vi.mocked(useQuery).mockClear()
    useLatestGlucose()
    const options = vi.mocked(useQuery).mock.calls[0]?.[0]
    expect(options).toMatchObject({
      queryKey: glucoseKeys.latest,
      queryFn: fetchLatestGlucose,
      refetchIntervalInBackground: false,
      retry: false,
    })
    expect(typeof options?.refetchInterval).toBe('function')
  })
})
