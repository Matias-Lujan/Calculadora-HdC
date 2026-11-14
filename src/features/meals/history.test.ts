import {
  InfiniteQueryObserver,
  QueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  appliedDoseText,
  isFromHistoryList,
  isPlainLeftClick,
  mealSummaryText,
  nextMealsOffset,
  withoutMeal,
} from './history.ts'
import type { MealSummary, MealsPage } from './types.ts'

// Invented data.

function meal(n: number, overrides: Partial<MealSummary> = {}): MealSummary {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    eaten_at: '2026-11-14T16:05:00+00:00',
    total_carbs_g: 30,
    calculated_dose_units: 2,
    applied_dose_units: 2,
    ...overrides,
  }
}

/** A page of `count` meals, numbered from `from`. */
function page(from: number, count: number, hasMore: boolean): MealsPage {
  return {
    meals: Array.from({ length: count }, (_, i) => meal(from + i)),
    hasMore,
  }
}

describe('nextMealsOffset', () => {
  it('after a full first page with more: 50', () => {
    const first = page(0, 50, true)
    expect(nextMealsOffset(first, [first])).toBe(50)
  })

  it('after two full pages with more: 100', () => {
    const pages = [page(0, 50, true), page(50, 50, true)]
    expect(nextMealsOffset(pages[1] as MealsPage, pages)).toBe(100)
  })

  it('after a page with one meal removed (deleted): 49', () => {
    const first = page(0, 49, true)
    expect(nextMealsOffset(first, [first])).toBe(49)
  })

  it.each([
    ['20 without more', [page(0, 20, false)]],
    ['0 without more', [page(0, 0, false)]],
    [
      '50 with more, then 3 without more',
      [page(0, 50, true), page(50, 3, false)],
    ],
  ])('%s: undefined', (_, pages) => {
    const last = pages[pages.length - 1] as MealsPage
    expect(nextMealsOffset(last, pages)).toBeUndefined()
  })
})

describe('withoutMeal', () => {
  const data: InfiniteData<MealsPage, number> = {
    pages: [page(0, 3, true), page(3, 3, false)],
    pageParams: [0, 3],
  }

  it('removes the meal from the page it is in', () => {
    const target = meal(4)
    const result = withoutMeal(data, target.id)
    expect(result.pages[0]?.meals).toEqual(data.pages[0]?.meals)
    expect(result.pages[1]?.meals.map((m) => m.id)).toEqual([
      meal(3).id,
      meal(5).id,
    ])
  })

  it('an id that is not there leaves the same content', () => {
    expect(withoutMeal(data, meal(99).id)).toEqual(data)
  })

  it('keeps the page params and hasMore', () => {
    const result = withoutMeal(data, meal(0).id)
    expect(result.pageParams).toEqual([0, 3])
    expect(result.pages.map((p) => p.hasMore)).toEqual([true, false])
  })

  it('does not modify the input', () => {
    const before = structuredClone(data)
    withoutMeal(data, meal(1).id)
    withoutMeal(data, meal(4).id)
    expect(data).toEqual(before)
  })
})

describe('nextMealsOffset: bordes', () => {
  it('an empty last page that says there is more: the meals of the others', () => {
    const pages = [page(0, 50, true), page(50, 0, true)]
    expect(nextMealsOffset(pages[1] as MealsPage, pages)).toBe(50)
  })

  it('counts meals, not pages (three pages: 50 + 50 + 50)', () => {
    const pages = [page(0, 50, true), page(50, 50, true), page(100, 50, true)]
    expect(nextMealsOffset(pages[2] as MealsPage, pages)).toBe(150)
  })

  it('only the last page decides whether there is more', () => {
    // An earlier page with hasMore false (it can't happen from the server)
    // does not stop the paging.
    const pages = [page(0, 50, false), page(50, 50, true)]
    expect(nextMealsOffset(pages[1] as MealsPage, pages)).toBe(100)
  })
})

describe('withoutMeal: with several pages', () => {
  const three: InfiniteData<MealsPage, number> = {
    pages: [page(0, 50, true), page(50, 50, true), page(100, 10, false)],
    pageParams: [0, 50, 100],
  }

  function ids(p: MealsPage | undefined): string[] {
    return p?.meals.map((m) => m.id) ?? []
  }

  it('the last meal of a page: only that page loses it', () => {
    const result = withoutMeal(three, meal(49).id)
    expect(ids(result.pages[0])).toEqual(
      Array.from({ length: 49 }, (_, i) => meal(i).id),
    )
    expect(result.pages[1]).toEqual(three.pages[1])
    expect(result.pages[2]).toEqual(three.pages[2])
    expect(result.pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(result.pageParams).toEqual([0, 50, 100])
  })

  it('a meal of the first page, with three pages loaded', () => {
    const result = withoutMeal(three, meal(0).id)
    expect(result.pages.map((p) => p.meals.length)).toEqual([49, 50, 10])
    expect(ids(result.pages[0])[0]).toBe(meal(1).id)
    expect(result.pages[1]).toEqual(three.pages[1])
    expect(result.pages[2]).toEqual(three.pages[2])
  })

  it('the only meal of the last page: the page stays, empty', () => {
    const data: InfiniteData<MealsPage, number> = {
      pages: [page(0, 50, true), page(50, 1, false)],
      pageParams: [0, 50],
    }
    const result = withoutMeal(data, meal(50).id)
    expect(result.pages).toHaveLength(2)
    expect(result.pages[1]).toEqual({ meals: [], hasMore: false })
    expect(result.pageParams).toEqual([0, 50])
    expect(
      nextMealsOffset(result.pages[1] as MealsPage, result.pages),
    ).toBeUndefined()
  })

  it('with more pages to load, the next offset is one less', () => {
    const data: InfiniteData<MealsPage, number> = {
      pages: [page(0, 50, true), page(50, 50, true)],
      pageParams: [0, 50],
    }
    const result = withoutMeal(data, meal(10).id)
    expect(nextMealsOffset(result.pages[1] as MealsPage, result.pages)).toBe(99)
  })

  it('an empty list stays empty', () => {
    const data: InfiniteData<MealsPage, number> = {
      pages: [page(0, 0, false)],
      pageParams: [0],
    }
    expect(withoutMeal(data, meal(0).id)).toEqual(data)
  })
})

// The paging through react-query itself (spec §14 #47), with a fake server
// that answers like fetchMealsPage (at most 51 rows from the offset, the
// extra one only says there is more). The options are the ones of
// useMealList.
describe('the paging with react-query', () => {
  function fakeServer(count: number) {
    let rows = Array.from({ length: count }, (_, i) => meal(i))
    const offsets: number[] = []
    return {
      offsets,
      remove(id: string) {
        rows = rows.filter((m) => m.id !== id)
      },
      fetchPage(offset: number): Promise<MealsPage> {
        offsets.push(offset)
        const slice = rows.slice(offset, offset + 51)
        return Promise.resolve({
          meals: slice.slice(0, 50),
          hasMore: slice.length > 50,
        })
      },
    }
  }

  function setup(count: number) {
    const server = fakeServer(count)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const observer = new InfiniteQueryObserver(client, {
      queryKey: ['meals', 'list'],
      queryFn: ({ pageParam }) => server.fetchPage(pageParam),
      initialPageParam: 0,
      getNextPageParam: nextMealsOffset,
    })
    return { server, client, observer }
  }

  function loadedIds(client: QueryClient): string[] {
    const data = client.getQueryData<InfiniteData<MealsPage, number>>([
      'meals',
      'list',
    ])
    return data?.pages.flatMap((p) => p.meals.map((m) => m.id)) ?? []
  }

  it('"Ver más" asks from the meals loaded, until there are no more', async () => {
    const { server, client, observer } = setup(120)
    await observer.refetch()
    expect(observer.getCurrentResult().hasNextPage).toBe(true)
    await observer.fetchNextPage()
    await observer.fetchNextPage()
    expect(server.offsets).toEqual([0, 50, 100])
    expect(observer.getCurrentResult().hasNextPage).toBe(false)
    expect(loadedIds(client)).toEqual(
      Array.from({ length: 120 }, (_, i) => meal(i).id),
    )
  })

  it('exactly 100 meals: two pages and no "Ver más"', async () => {
    const { server, client, observer } = setup(100)
    await observer.refetch()
    await observer.fetchNextPage()
    expect(server.offsets).toEqual([0, 50])
    expect(observer.getCurrentResult().hasNextPage).toBe(false)
    expect(loadedIds(client)).toHaveLength(100)
  })

  it('after deleting, the refetch neither repeats nor skips a meal', async () => {
    const { server, client, observer } = setup(120)
    await observer.refetch()
    await observer.fetchNextPage()

    // What useDeleteMeal does once the server confirmed, with the list
    // inactive (the detail is shown): no read happens yet.
    const deleted = meal(10).id
    server.remove(deleted)
    client.setQueryData<InfiniteData<MealsPage, number>>(
      ['meals', 'list'],
      (old) => old && withoutMeal(old, deleted),
    )
    await client.invalidateQueries({ queryKey: ['meals', 'list'] })
    expect(server.offsets).toEqual([0, 50])
    expect(loadedIds(client)).toHaveLength(99)
    expect(loadedIds(client)).not.toContain(deleted)

    // Back in the list: the pages are read again from the first one, with
    // the offsets recomputed from what came back.
    await observer.refetch()
    expect(server.offsets).toEqual([0, 50, 0, 50])
    const expected = Array.from({ length: 101 }, (_, i) => meal(i).id).filter(
      (id) => id !== deleted,
    )
    expect(loadedIds(client)).toEqual(expected)

    await observer.fetchNextPage()
    expect(server.offsets.at(-1)).toBe(100)
    expect(loadedIds(client)).toHaveLength(119)
    expect(new Set(loadedIds(client)).size).toBe(119)
    expect(observer.getCurrentResult().hasNextPage).toBe(false)
  })
})

describe('isFromHistoryList', () => {
  it('the state of a row of the list: true', () => {
    expect(isFromHistoryList({ fromHistory: true })).toBe(true)
  })

  it('with other keys besides fromHistory: true', () => {
    expect(isFromHistoryList({ fromHistory: true, other: 1 })).toBe(true)
  })

  // No state (from "Ver en el historial", a typed URL, a reopened app) or
  // anything else the browser history may hold.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['{}', {}],
    ["{ fromHistory: 'true' }", { fromHistory: 'true' }],
    ['{ fromHistory: false }', { fromHistory: false }],
    ['{ fromHistory: 1 }', { fromHistory: 1 }],
    ['{ fromHistory: undefined }', { fromHistory: undefined }],
    ['a string', 'fromHistory'],
    ['true', true],
    ['a number', 1],
    ['an array', [true]],
    ['an array of the state', [{ fromHistory: true }]],
  ])('%s: false', (_, state) => {
    expect(isFromHistoryList(state)).toBe(false)
  })
})

describe('isPlainLeftClick', () => {
  const plain = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  }

  it('a plain left click (or a tap): true', () => {
    expect(isPlainLeftClick(plain)).toBe(true)
  })

  // The link acts as usual: a new tab or window with /history.
  it.each([
    ['Cmd', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['Ctrl and Shift', { ctrlKey: true, shiftKey: true }],
    ['the middle button', { button: 1 }],
    ['the right button', { button: 2 }],
    ['the middle button with Cmd', { button: 1, metaKey: true }],
  ])('%s: false', (_, overrides) => {
    expect(isPlainLeftClick({ ...plain, ...overrides })).toBe(false)
  })
})

// --- Added by the tester ---

describe('isFromHistoryList: bordes', () => {
  // pushState stores a structured clone, and a reload reads that clone back.
  it('the state of a row after the browser history clones it: true', () => {
    expect(isFromHistoryList(structuredClone({ fromHistory: true }))).toBe(true)
  })

  it.each([
    ["{ fromHistory: 'false' }", { fromHistory: 'false' }],
    ["{ fromHistory: '1' }", { fromHistory: '1' }],
    ['{ fromHistory: [true] }', { fromHistory: [true] }],
    [
      '{ fromHistory: { fromHistory: true } }',
      { fromHistory: { fromHistory: true } },
    ],
    ['{ FromHistory: true }', { FromHistory: true }],
    ['a Boolean object', { fromHistory: Object(true) as unknown }],
  ])('%s: false', (_, state) => {
    expect(isFromHistoryList(state)).toBe(false)
  })
})

// "← Historial" and the scroll restoration of react-router (spec §6.7
// "Scroll", §14 #47 (10)), with a memory router and the same mechanism
// ScrollRestoration uses: the router saves the scroll of the screen it
// leaves (by location.key) and, on each navigation, `restoreScrollPosition`
// says where to scroll (null: to the top). A row links with the state
// { fromHistory: true }; the detail goes back with navigate(-1) only if
// isFromHistoryList, and otherwise links to /history, as MealDetailPage.
describe('"← Historial" with the scroll restoration of react-router', () => {
  type Router = ReturnType<typeof createMemoryRouter>
  const id = meal(7).id

  function setup(initialEntry: string) {
    const router = createMemoryRouter(
      [{ path: '/' }, { path: '/history' }, { path: '/history/:mealId' }],
      { initialEntries: [initialEntry] },
    )
    const scroll = { y: 0 }
    router.enableScrollRestoration({}, () => scroll.y)
    return { router, scroll }
  }

  function openRow(router: Router) {
    return router.navigate(`/history/${id}`, { state: { fromHistory: true } })
  }

  function backToList(router: Router) {
    return isFromHistoryList(router.state.location.state)
      ? router.navigate(-1)
      : router.navigate('/history')
  }

  it('from a row: the detail opens at the top and the list comes back where it was', async () => {
    const { router, scroll } = setup('/history')
    scroll.y = 2400
    await openRow(router)
    expect(router.state.restoreScrollPosition).toBeNull()

    scroll.y = 900 // scrolled down the detail
    await backToList(router)
    expect(router.state.location.pathname).toBe('/history')
    expect(router.state.historyAction).toBe('POP')
    expect(router.state.restoreScrollPosition).toBe(2400)
  })

  it('forward to the detail again: it keeps the state and goes back again', async () => {
    const { router, scroll } = setup('/history')
    scroll.y = 2400
    await openRow(router)
    await backToList(router)
    await router.navigate(1)
    expect(router.state.location.pathname).toBe(`/history/${id}`)
    expect(isFromHistoryList(router.state.location.state)).toBe(true)

    await backToList(router)
    expect(router.state.restoreScrollPosition).toBe(2400)
  })

  it('from "Ver en el historial" (no state): the list opens at the top', async () => {
    const { router, scroll } = setup('/')
    scroll.y = 600
    await router.navigate(`/history/${id}`)
    expect(isFromHistoryList(router.state.location.state)).toBe(false)

    await backToList(router)
    expect(router.state.location.pathname).toBe('/history')
    expect(router.state.historyAction).toBe('PUSH')
    expect(router.state.restoreScrollPosition).toBeNull()
  })

  it('a typed URL or a reopened app (no state): the list opens at the top', async () => {
    const { router } = setup(`/history/${id}`)
    expect(isFromHistoryList(router.state.location.state)).toBe(false)
    await backToList(router)
    expect(router.state.historyAction).toBe('PUSH')
    expect(router.state.restoreScrollPosition).toBeNull()
  })

  it('"Historial" in the bar opens a new list at the top; a row from it goes back to it', async () => {
    const { router, scroll } = setup('/history')
    scroll.y = 2400
    await openRow(router)
    await router.navigate('/history') // the NavLink
    expect(router.state.restoreScrollPosition).toBeNull()

    scroll.y = 300
    await openRow(router)
    await backToList(router)
    expect(router.state.restoreScrollPosition).toBe(300)
  })

  it('after deleting (replace), the list opens at the top', async () => {
    const { router, scroll } = setup('/history')
    scroll.y = 2400
    await openRow(router)
    await router.navigate('/history', { replace: true })
    expect(router.state.location.pathname).toBe('/history')
    expect(isFromHistoryList(router.state.location.state)).toBe(false)
    expect(router.state.restoreScrollPosition).toBeNull()
  })
})

describe('appliedDoseText', () => {
  it.each([
    [8.5, '8,50 U'],
    [128.24 / 15, '8,55 U'],
    [0, '0,00 U'],
    [1.005, '1,01 U'],
  ])('%s → %s', (units, text) => {
    expect(appliedDoseText(units)).toBe(text)
  })

  it('null → "—"', () => {
    expect(appliedDoseText(null)).toBe('—')
  })
})

describe('mealSummaryText', () => {
  it('the meal of spec §8.3, applied 8,5', () => {
    expect(
      mealSummaryText(
        meal(0, {
          total_carbs_g: 128.24,
          calculated_dose_units: 128.24 / 15,
          applied_dose_units: 8.5,
        }),
      ),
    ).toBe('HC 128,2 g · Dosis 8,55 U · Aplicada 8,50 U')
  })

  it('everything 0', () => {
    expect(
      mealSummaryText(
        meal(0, {
          total_carbs_g: 0,
          calculated_dose_units: 0,
          applied_dose_units: 0,
        }),
      ),
    ).toBe('HC 0,0 g · Dosis 0,00 U · Aplicada 0,00 U')
  })

  it('without an applied dose', () => {
    expect(mealSummaryText(meal(0, { applied_dose_units: null }))).toBe(
      'HC 30,0 g · Dosis 2,00 U · Aplicada —',
    )
  })

  it('no thousands separator in the carbs', () => {
    expect(mealSummaryText(meal(0, { total_carbs_g: 1234.5 }))).toMatch(
      /^HC 1234,5 g · /,
    )
  })
})
