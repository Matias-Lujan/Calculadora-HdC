import {
  InfiniteQueryObserver,
  QueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  appliedDoseParts,
  appliedDoseText,
  daySummaryText,
  groupMealsByDay,
  isFromHistoryList,
  isPlainLeftClick,
  mealFoodsText,
  mealRowDetailText,
  mealRowLabel,
  nextMealsOffset,
  openDaysFromState,
  toggledDays,
  withoutMeal,
} from './history.ts'
import type { ListedMeal, MealsPage } from './types.ts'

// Invented data.

function meal(n: number, overrides: Partial<ListedMeal> = {}): ListedMeal {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    eaten_at: '2026-11-14T16:05:00+00:00',
    total_carbs_g: 30,
    calculated_dose_units: 2,
    applied_dose_units: 2,
    meal_items: [{ position: 0, food_name: 'Arroz de prueba' }],
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
  // Without trailing zeros: "7,00" can be read as "700" (UX-02).
  it.each([
    [8.5, '8,5\u00a0unidades'],
    [7, '7\u00a0unidades'],
    [128.24 / 15, '8,55\u00a0unidades'],
    [0, '0\u00a0unidades'],
    [1.005, '1,01\u00a0unidades'],
    [8.999, '9\u00a0unidades'],
    [0.5, '0,5\u00a0unidades'],
    [10, '10\u00a0unidades'],
    [1, '1\u00a0unidad'],
    [1.004, '1\u00a0unidad'],
  ])('%s → %s', (units, text) => {
    expect(appliedDoseText(units)).toBe(text)
  })

  it('null → "—"', () => {
    expect(appliedDoseText(null)).toBe('—')
  })

  it('never says "U"', () => {
    expect(appliedDoseText(7)).not.toMatch(/\bU\b/)
  })
})

// --- A row of the list (UX-11) ---

describe('appliedDoseParts', () => {
  it.each([
    [5.5, '5,5', 'unidades'],
    [7, '7', 'unidades'],
    [1, '1', 'unidad'],
    [1.004, '1', 'unidad'],
    [1.005, '1,01', 'unidades'],
    [0, '0', 'unidades'],
    [128.24 / 15, '8,55', 'unidades'],
  ])('%s → %s %s', (units, number, word) => {
    expect(appliedDoseParts(units)).toEqual({ number, word })
  })

  it('without an applied dose: null (the row shows "—")', () => {
    expect(appliedDoseParts(null)).toBeNull()
  })
})

describe('mealRowDetailText', () => {
  it('the carbs and the calculated dose, with 2 decimals', () => {
    expect(
      mealRowDetailText(
        meal(0, {
          total_carbs_g: 80.84,
          calculated_dose_units: 80.84 / 15,
          applied_dose_units: 5.5,
        }),
      ),
    ).toBe('80,8 g de HC · calculada 5,39')
  })

  it('applied equal to the calculated one: only the carbs', () => {
    expect(
      mealRowDetailText(
        meal(0, {
          total_carbs_g: 105,
          calculated_dose_units: 7,
          applied_dose_units: 7,
        }),
      ),
    ).toBe('105,0 g de HC')
  })

  it('equal as shown with 2 decimals counts as equal', () => {
    // 8,4966… shows "8,50", as the applied 8,5.
    expect(
      mealRowDetailText(
        meal(0, {
          total_carbs_g: 127.45,
          calculated_dose_units: 127.45 / 15,
          applied_dose_units: 8.5,
        }),
      ),
    ).toBe('127,5 g de HC')
  })

  it('a difference in the second decimal shows the calculated one', () => {
    expect(
      mealRowDetailText(
        meal(0, { calculated_dose_units: 8.54, applied_dose_units: 8.55 }),
      ),
    ).toBe('30,0 g de HC · calculada 8,54')
  })

  it('without an applied dose, the calculated one shows', () => {
    expect(mealRowDetailText(meal(0, { applied_dose_units: null }))).toBe(
      '30,0 g de HC · calculada 2,00',
    )
  })

  it('everything 0: only the carbs', () => {
    expect(
      mealRowDetailText(
        meal(0, {
          total_carbs_g: 0,
          calculated_dose_units: 0,
          applied_dose_units: 0,
        }),
      ),
    ).toBe('0,0 g de HC')
  })
})

describe('mealRowLabel', () => {
  // 16:05 UTC is 13:05 in Buenos Aires.
  it('everything the row says, with the calculated dose when it shows', () => {
    expect(
      mealRowLabel(
        meal(0, {
          total_carbs_g: 80.84,
          calculated_dose_units: 80.84 / 15,
          applied_dose_units: 5.5,
          meal_items: [
            { position: 1, food_name: 'Pan de campo' },
            { position: 0, food_name: 'Arroz largo fino' },
          ],
        }),
      ),
    ).toBe(
      '13:05. Arroz largo fino, Pan de campo. 80,8 g de HC. Te aplicaste 5,5 unidades. Calculada: 5,39 unidades.',
    )
  })

  it('applied equal to the calculated one: without the calculated dose', () => {
    expect(mealRowLabel(meal(0))).toBe(
      '13:05. Arroz de prueba. 30,0 g de HC. Te aplicaste 2 unidades.',
    )
  })

  it('without an applied dose', () => {
    expect(mealRowLabel(meal(0, { applied_dose_units: null }))).toBe(
      '13:05. Arroz de prueba. 30,0 g de HC. No anotaste cuánto te aplicaste. Calculada: 2,00 unidades.',
    )
  })

  it('one unit', () => {
    expect(
      mealRowLabel(
        meal(0, {
          total_carbs_g: 15,
          calculated_dose_units: 1,
          applied_dose_units: 1,
        }),
      ),
    ).toContain('Te aplicaste 1 unidad.')
  })
})

// --- The days of the list (spec §6.7, §14 #62) ---

describe('mealFoodsText', () => {
  it('the names in the order they were entered, not the order they came in', () => {
    expect(
      mealFoodsText(
        meal(0, {
          meal_items: [
            { position: 2, food_name: 'Manzana' },
            { position: 0, food_name: 'Arroz' },
            { position: 1, food_name: 'Pollo' },
          ],
        }),
      ),
    ).toBe('Arroz, Pollo, Manzana')
  })

  it('one food: only its name', () => {
    expect(mealFoodsText(meal(0))).toBe('Arroz de prueba')
  })

  it('the same food twice shows twice; names are shown as saved', () => {
    expect(
      mealFoodsText(
        meal(0, {
          meal_items: [
            { position: 0, food_name: 'Alfajor Marca, triple' },
            { position: 1, food_name: 'Alfajor Marca, triple' },
          ],
        }),
      ),
    ).toBe('Alfajor Marca, triple, Alfajor Marca, triple')
  })

  it('does not modify the meal', () => {
    const m = meal(0, {
      meal_items: [
        { position: 1, food_name: 'B' },
        { position: 0, food_name: 'A' },
      ],
    })
    const before = structuredClone(m)
    mealFoodsText(m)
    expect(m).toEqual(before)
  })
})

describe('groupMealsByDay', () => {
  function days(meals: ListedMeal[], hasMore: boolean) {
    return groupMealsByDay(meals, hasMore).map((d) => ({
      day: d.day,
      ids: d.meals.map((m) => m.id),
      complete: d.complete,
    }))
  }

  it('no meals: no days', () => {
    expect(groupMealsByDay([], false)).toEqual([])
    expect(groupMealsByDay([], true)).toEqual([])
  })

  it('around midnight of Buenos Aires (03:00 UTC)', () => {
    const meals = [
      meal(0, { eaten_at: '2026-11-15T03:00:00+00:00' }), // 15/11 00:00
      meal(1, { eaten_at: '2026-11-15T02:59:59.999+00:00' }), // 14/11 23:59
      meal(2, { eaten_at: '2026-11-14T03:00:00Z' }), // 14/11 00:00
      meal(3, { eaten_at: '2026-11-14T02:59:00Z' }), // 13/11 23:59
    ]
    expect(days(meals, false)).toEqual([
      { day: '2026-11-15', ids: [meal(0).id], complete: true },
      { day: '2026-11-14', ids: [meal(1).id, meal(2).id], complete: true },
      { day: '2026-11-13', ids: [meal(3).id], complete: true },
    ])
  })

  it('a UTC date of the next day is still the day before in Buenos Aires', () => {
    // 21:30 of the 14th in Buenos Aires is 00:30 UTC of the 15th.
    const meals = [meal(0, { eaten_at: '2026-11-15T00:30:00Z' })]
    expect(days(meals, false)[0]?.day).toBe('2026-11-14')
  })

  it('an offset other than UTC', () => {
    const meals = [
      meal(0, { eaten_at: '2026-11-14T23:30:00-03:00' }),
      meal(1, { eaten_at: '2026-11-15T01:30:00+01:00' }), // 14/11 21:30
    ]
    expect(days(meals, false)).toEqual([
      { day: '2026-11-14', ids: [meal(0).id, meal(1).id], complete: true },
    ])
  })

  it('across the change of year', () => {
    const meals = [
      meal(0, { eaten_at: '2027-01-01T03:00:00Z' }), // 01/01/2027 00:00
      meal(1, { eaten_at: '2027-01-01T02:30:00Z' }), // 31/12/2026 23:30
    ]
    expect(days(meals, false)).toEqual([
      { day: '2027-01-01', ids: [meal(0).id], complete: true },
      { day: '2026-12-31', ids: [meal(1).id], complete: true },
    ])
  })

  it('keeps the order of the list inside each day', () => {
    const meals = [
      meal(5, { eaten_at: '2026-11-14T20:00:00Z' }),
      meal(3, { eaten_at: '2026-11-14T16:00:00Z' }),
      meal(9, { eaten_at: '2026-11-14T16:00:00Z' }),
    ]
    expect(days(meals, false)[0]?.ids).toEqual([
      meal(5).id,
      meal(3).id,
      meal(9).id,
    ])
  })

  it('with a next page, only the day of the last meal is not complete', () => {
    const meals = [
      meal(0, { eaten_at: '2026-11-15T15:00:00Z' }),
      meal(1, { eaten_at: '2026-11-14T15:00:00Z' }),
      meal(2, { eaten_at: '2026-11-14T12:00:00Z' }),
    ]
    expect(days(meals, true).map((d) => [d.day, d.complete])).toEqual([
      ['2026-11-15', true],
      ['2026-11-14', false],
    ])
  })

  it('with a next page and a single day: that day is not complete', () => {
    const meals = Array.from({ length: 50 }, (_, i) =>
      meal(i, { eaten_at: '2026-11-14T15:00:00Z' }),
    )
    expect(days(meals, true)).toEqual([
      { day: '2026-11-14', ids: meals.map((m) => m.id), complete: false },
    ])
  })

  it('"Ver más" completes the day: the meals of the next page join it', () => {
    const first = [
      meal(0, { eaten_at: '2026-11-15T15:00:00Z' }),
      meal(1, { eaten_at: '2026-11-14T15:00:00Z' }),
    ]
    const second = [
      meal(2, { eaten_at: '2026-11-14T12:00:00Z' }),
      meal(3, { eaten_at: '2026-11-13T12:00:00Z' }),
    ]
    expect(days([...first, ...second], false)).toEqual([
      { day: '2026-11-15', ids: [meal(0).id], complete: true },
      { day: '2026-11-14', ids: [meal(1).id, meal(2).id], complete: true },
      { day: '2026-11-13', ids: [meal(3).id], complete: true },
    ])
    // With yet another page, the 13th is the one that waits.
    expect(days([...first, ...second], true).map((d) => d.complete)).toEqual([
      true,
      true,
      false,
    ])
  })

  it('does not modify the input', () => {
    const meals = [meal(0), meal(1)]
    const before = structuredClone(meals)
    groupMealsByDay(meals, true)
    expect(meals).toEqual(before)
  })
})

describe('daySummaryText', () => {
  function day(meals: ListedMeal[], complete = true) {
    return { day: '2026-11-14', meals, complete }
  }

  it('one meal', () => {
    expect(daySummaryText(day([meal(0, { total_carbs_g: 30 })]))).toBe(
      '1 comida · 30,0 g de HC',
    )
  })

  it('several meals: the total of the day, rounded once', () => {
    expect(
      daySummaryText(
        day([
          meal(0, { total_carbs_g: 0.1 }),
          meal(1, { total_carbs_g: 0.2 }),
          meal(2, { total_carbs_g: 184.7 }),
        ]),
      ),
    ).toBe('3 comidas · 185,0 g de HC')
    // Each 1,05 alone shows "1,1"; the day shows 2,1 and not 2,2.
    expect(
      daySummaryText(
        day([
          meal(0, { total_carbs_g: 1.05 }),
          meal(1, { total_carbs_g: 1.05 }),
        ]),
      ),
    ).toBe('2 comidas · 2,1 g de HC')
  })

  it('a day with 0 carbs', () => {
    expect(daySummaryText(day([meal(0, { total_carbs_g: 0 })]))).toBe(
      '1 comida · 0,0 g de HC',
    )
  })

  it('a day that is not complete shows nothing', () => {
    expect(daySummaryText(day([meal(0), meal(1)], false))).toBeNull()
  })

  it('a total that overflows: only the count', () => {
    expect(
      daySummaryText(
        day([
          meal(0, { total_carbs_g: Number.MAX_VALUE }),
          meal(1, { total_carbs_g: Number.MAX_VALUE }),
        ]),
      ),
    ).toBe('2 comidas')
  })
})

// "Hoy" and "Ayer" (todayAndYesterday), open when the list opens (UX-11).
const AT_START = ['2026-11-16', '2026-11-15']

describe('openDaysFromState', () => {
  it('the open days of the entry', () => {
    expect(
      openDaysFromState({ openDays: ['2026-11-14', '2026-11-12'] }, AT_START),
    ).toEqual(['2026-11-14', '2026-11-12'])
  })

  it('after the browser history clones it', () => {
    expect(
      openDaysFromState(
        structuredClone({ openDays: ['2026-11-14'] }),
        AT_START,
      ),
    ).toEqual(['2026-11-14'])
  })

  it('the entry with every day folded wins over "Hoy" and "Ayer"', () => {
    expect(openDaysFromState({ openDays: [] }, AT_START)).toEqual([])
  })

  it('the days at start are a copy', () => {
    const atStart = ['2026-11-16']
    const open = openDaysFromState(null, atStart)
    open.push('2026-11-14')
    expect(atStart).toEqual(['2026-11-16'])
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['{}', {}],
    ['the state of a row', { fromHistory: true }],
    ['openDays as text', { openDays: '2026-11-14' }],
    ['openDays with a number', { openDays: [1] }],
    ['an array', ['2026-11-14']],
  ])('%s: "Hoy" and "Ayer" open', (_, state) => {
    expect(openDaysFromState(state, AT_START)).toEqual(AT_START)
  })
})

describe('toggledDays', () => {
  it('opens a folded day, at the end', () => {
    expect(toggledDays(['2026-11-14'], '2026-11-12')).toEqual([
      '2026-11-14',
      '2026-11-12',
    ])
  })

  it('folds an open day', () => {
    expect(toggledDays(['2026-11-14', '2026-11-12'], '2026-11-14')).toEqual([
      '2026-11-12',
    ])
  })

  it('does not modify the input', () => {
    const open = ['2026-11-14']
    toggledDays(open, '2026-11-12')
    toggledDays(open, '2026-11-14')
    expect(open).toEqual(['2026-11-14'])
  })
})

// The open days and the scroll restoration, as HistoryPage does it: a toggle
// replaces the entry of the list with the new state and preventScrollReset.
describe('the open days with the scroll restoration of react-router', () => {
  function setup() {
    const router = createMemoryRouter(
      [{ path: '/' }, { path: '/history' }, { path: '/history/:mealId' }],
      { initialEntries: ['/', '/history'] },
    )
    const scroll = { y: 0 }
    router.enableScrollRestoration({}, () => scroll.y)
    return { router, scroll }
  }

  type Router = ReturnType<typeof setup>['router']

  function toggle(router: Router, day: string) {
    const open = openDaysFromState(router.state.location.state, AT_START)
    return router.navigate('/history', {
      replace: true,
      state: { openDays: toggledDays(open, day) },
      preventScrollReset: true,
    })
  }

  it('a toggle does not move the list nor add an entry', async () => {
    const { router, scroll } = setup()
    scroll.y = 800
    await toggle(router, '2026-11-14')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.preventScrollReset).toBe(true)
    expect(openDaysFromState(router.state.location.state, AT_START)).toEqual([
      ...AT_START,
      '2026-11-14',
    ])
    // Back leaves /history: no entry was added.
    await router.navigate(-1)
    expect(router.state.location.pathname).toBe('/')
  })

  it('back from a meal: the same days open and the same scroll', async () => {
    const { router, scroll } = setup()
    await toggle(router, '2026-11-16') // folds "Hoy"
    await toggle(router, '2026-11-12')
    scroll.y = 2400
    await router.navigate('/history/x', { state: { fromHistory: true } })
    scroll.y = 0
    await router.navigate(-1)
    expect(router.state.location.pathname).toBe('/history')
    expect(openDaysFromState(router.state.location.state, AT_START)).toEqual([
      '2026-11-15',
      '2026-11-12',
    ])
    expect(router.state.restoreScrollPosition).toBe(2400)
  })

  it('"Historial" in the bar: "Hoy" and "Ayer" open, at the top', async () => {
    const { router } = setup()
    await toggle(router, '2026-11-16')
    await toggle(router, '2026-11-15')
    await router.navigate('/history/x', { state: { fromHistory: true } })
    await router.navigate('/history') // the NavLink
    expect(openDaysFromState(router.state.location.state, AT_START)).toEqual(
      AT_START,
    )
    expect(router.state.restoreScrollPosition).toBeNull()
  })
})

// --- Added by the tester ---

describe('groupMealsByDay and daySummaryText: bordes', () => {
  it('the next page starts on another day: the day stays as it was, now complete', () => {
    // The first page ends at 14/11 00:00 (Buenos Aires); the next one starts
    // at 13/11 23:59:59,999, one millisecond before.
    const first = [
      meal(0, { eaten_at: '2026-11-14T15:00:00Z', total_carbs_g: 40 }),
      meal(1, { eaten_at: '2026-11-14T03:00:00Z', total_carbs_g: 20 }),
    ]
    const second = [
      meal(2, { eaten_at: '2026-11-14T02:59:59.999Z', total_carbs_g: 10 }),
    ]
    // Before "Ver más": the 14th waits, with no count nor total.
    const before = groupMealsByDay(first, true)
    expect(before.map((d) => [d.day, d.complete])).toEqual([
      ['2026-11-14', false],
    ])
    expect(before.map(daySummaryText)).toEqual([null])
    // After it: the 14th has the same two meals and shows them; the 13th
    // waits if there is yet another page.
    const after = groupMealsByDay([...first, ...second], true)
    expect(after.map((d) => [d.day, d.meals.length, d.complete])).toEqual([
      ['2026-11-14', 2, true],
      ['2026-11-13', 1, false],
    ])
    expect(after.map(daySummaryText)).toEqual([
      '2 comidas · 60,0 g de HC',
      null,
    ])
    const last = groupMealsByDay([...first, ...second], false)
    expect(last.map(daySummaryText)).toEqual([
      '2 comidas · 60,0 g de HC',
      '1 comida · 10,0 g de HC',
    ])
  })

  it.each([
    ['a negative value', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])(
    'the total comes only from sumCarbs: %s shows only the count',
    (_, bad) => {
      expect(
        daySummaryText({
          day: '2026-11-14',
          meals: [
            meal(0, { total_carbs_g: 30 }),
            meal(1, { total_carbs_g: bad }),
          ],
          complete: true,
        }),
      ).toBe('2 comidas')
    },
  )
})
