import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlucoseError, UnauthorizedError } from '../../lib/errors.ts'
import {
  MEALS_PAGE_SIZE,
  RECENT_MEALS_LIMIT,
  createMeal,
  deleteMeal,
  fetchDayMealTimes,
  fetchGlucoseDay,
  fetchLatestGlucose,
  fetchMeal,
  fetchMealsPage,
  fetchRecentMeals,
  fetchReferenceFoods,
  saveMeal,
} from './api.ts'
import type {
  CreateMealPayload,
  NewMealItem,
  NewMealRecord,
  NewTableFood,
} from './types.ts'

// A fake Supabase client. Each from() starts a chain that records its table
// and its calls, and resolves with the next result of a queue (one per
// chain). rpc() is a chain too, named "rpc:<function>", with one "rpc" call.
// A result can also be an Error, to make the chain reject.
const fake = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] }
  type Result = { data: unknown; error: unknown } | Error
  type Chain = { table: string; calls: Call[] }
  const state = {
    chains: [] as Chain[],
    results: [] as Result[],
    // Edge Functions: what each call got and what it answers.
    invokeCalls: [] as unknown[][],
    invokeResult: { data: null as unknown, error: null as unknown },
  }
  function builder(chain: Chain, result: Result): Record<string, unknown> {
    const b: Record<string, unknown> = {}
    for (const method of [
      'insert',
      'select',
      'single',
      'maybeSingle',
      'update',
      'eq',
      'is',
      'gte',
      'order',
      'range',
      'limit',
    ]) {
      b[method] = (...args: unknown[]) => {
        chain.calls.push({ method, args })
        return b
      }
    }
    b.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => (result instanceof Error ? reject(result) : resolve(result))
    return b
  }
  function start(chain: Chain): Record<string, unknown> {
    state.chains.push(chain)
    const result = state.results.shift() ?? { data: null, error: null }
    return builder(chain, result)
  }
  const supabase = {
    from: (table: string) => start({ table, calls: [] }),
    rpc: (fn: string, args: unknown) =>
      start({
        table: `rpc:${fn}`,
        calls: [{ method: 'rpc', args: [fn, args] }],
      }),
    functions: {
      invoke: (...args: unknown[]) => {
        state.invokeCalls.push(args)
        return Promise.resolve(state.invokeResult)
      },
    },
  }
  return { state, supabase }
})

vi.mock('../../lib/supabase.ts', () => ({ supabase: fake.supabase }))

// Invented data (the values of spec §8.3, two items).
const record: NewMealRecord = {
  meal: {
    eaten_at: '2026-11-14T16:05:00.000Z',
    carb_ratio_g_per_unit: 15,
    total_carbs_g: 99.24,
    calculated_dose_units: 6.616,
    applied_dose_units: 6.5,
    calc_version: '2',
  },
  items: [
    {
      food: { id: '00000000-0000-4000-8000-000000000002' },
      position: 0,
      food_name: 'Arroz de prueba',
      food_brand: null,
      food_source: 'manual',
      food_state: 'raw_cooked',
      quantity_mode: 'grams',
      units: null,
      unit_weight_g: null,
      grams: 250,
      carbs_per_100g: 78,
      cooking_factor: 2.6,
      effective_carbs_per_100g: 30,
      carbs_g: 75,
    },
    {
      food: { id: '00000000-0000-4000-8000-000000000001' },
      position: 1,
      food_name: 'Banana de prueba',
      food_brand: null,
      food_source: 'manual',
      food_state: 'as_eaten',
      quantity_mode: 'grams',
      units: null,
      unit_weight_g: null,
      grams: 120,
      carbs_per_100g: 20.2,
      cooking_factor: null,
      effective_carbs_per_100g: 20.2,
      carbs_g: 24.24,
    },
  ],
}

const MEAL_ID = '00000000-0000-4000-8000-0000000000aa'
const CLIENT_KEY = '00000000-0000-4000-8000-0000000000cc'

/** The payload items createMeal sends for items of the catalog. */
function catalogRows(items: NewMealItem[]) {
  return items.map(({ food, ...row }) => {
    if (!('id' in food)) throw new Error('not a catalog item')
    return { ...row, food_id: food.id }
  })
}

function methods(index: number): string[] {
  return fake.state.chains[index]?.calls.map((c) => c.method) ?? []
}

function argsOf(index: number, method: string): unknown[] | undefined {
  return fake.state.chains[index]?.calls.find((c) => c.method === method)?.args
}

/** The payload of the create_meal call of chain `index`. */
function payloadOf(index: number): CreateMealPayload {
  const args = argsOf(index, 'rpc')?.[1] as { payload: CreateMealPayload }
  return args.payload
}

beforeEach(() => {
  fake.state.chains = []
  fake.state.results = []
  fake.state.invokeCalls = []
  fake.state.invokeResult = { data: null, error: null }
})

describe('createMeal', () => {
  it('calls create_meal once with the meal and its items, and returns the id', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    await expect(createMeal(record, CLIENT_KEY)).resolves.toBe(MEAL_ID)

    expect(fake.state.chains).toHaveLength(1)
    expect(fake.state.chains[0]?.table).toBe('rpc:create_meal')
    expect(methods(0)).toEqual(['rpc'])
    expect(argsOf(0, 'rpc')).toEqual([
      'create_meal',
      {
        payload: {
          meal: { ...record.meal, client_key: CLIENT_KEY },
          items: catalogRows(record.items),
        },
      },
    ])
  })

  it('the payload has only the keys create_meal reads', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    await createMeal(record, CLIENT_KEY)
    const payload = payloadOf(0)
    expect(Object.keys(payload).sort()).toEqual(['items', 'meal'])
    expect(Object.keys(payload.meal).sort()).toEqual([
      'applied_dose_units',
      'calc_version',
      'calculated_dose_units',
      'carb_ratio_g_per_unit',
      'client_key',
      'eaten_at',
      'total_carbs_g',
    ])
    for (const item of payload.items) {
      expect(Object.keys(item).sort()).toEqual([
        'carbs_g',
        'carbs_per_100g',
        'cooking_factor',
        'effective_carbs_per_100g',
        'food_brand',
        'food_id',
        'food_name',
        'food_source',
        'food_state',
        'grams',
        'position',
        'quantity_mode',
        'unit_weight_g',
        'units',
      ])
    }
  })

  it('the payload survives JSON as is (the exact values, nulls included)', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    const exact: NewMealRecord = {
      ...record,
      meal: {
        ...record.meal,
        total_carbs_g: 128.2,
        calculated_dose_units: 128.2 / 15,
        applied_dose_units: 0,
      },
    }
    await createMeal(exact, CLIENT_KEY)
    const payload = payloadOf(0)
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
    expect(payload.meal.calculated_dose_units).toBe(128.2 / 15)
    expect(payload.meal.applied_dose_units).toBe(0)
  })

  it('does not modify the record', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    const before = structuredClone(record)
    await createMeal(record, CLIENT_KEY)
    expect(record).toEqual(before)
  })

  it('a meal with one item sends an array of one item', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    const one: NewMealRecord = { ...record, items: record.items.slice(0, 1) }
    await expect(createMeal(one, CLIENT_KEY)).resolves.toBe(MEAL_ID)
    expect(payloadOf(0).items).toEqual(catalogRows(record.items.slice(0, 1)))
  })

  it('a meal with many items is still a single call, in order', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    const first = record.items[0]
    if (first === undefined) throw new Error('no item')
    const many: NewMealRecord = {
      ...record,
      items: Array.from({ length: 60 }, (_, position) => ({
        ...first,
        position,
      })),
    }
    await createMeal(many, CLIENT_KEY)
    expect(fake.state.chains.map((chain) => chain.table)).toEqual([
      'rpc:create_meal',
    ])
    expect(payloadOf(0).items.map((item) => item.position)).toEqual(
      Array.from({ length: 60 }, (_, position) => position),
    )
  })

  it('never writes the tables directly', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    await createMeal(record, CLIENT_KEY)
    expect(fake.state.chains.map((chain) => chain.table)).not.toContain('meals')
    expect(fake.state.chains.map((chain) => chain.table)).not.toContain(
      'meal_items',
    )
  })

  it('throws the error create_meal returned as is', async () => {
    // A PostgrestError-like plain object, not an Error: it is thrown as is,
    // so the 401 handling can read its fields.
    const error = { message: 'x', code: 'P0001', details: '', hint: '' }
    fake.state.results = [{ data: null, error }]
    await expect(createMeal(record, CLIENT_KEY)).rejects.toBe(error)
    expect(fake.state.chains).toHaveLength(1)

    const expired = { message: 'JWT expired', code: 'PGRST301' }
    fake.state.chains = []
    fake.state.results = [{ data: null, error: expired }]
    await expect(createMeal(record, CLIENT_KEY)).rejects.toBe(expired)
  })

  it('if the call rejects, createMeal rejects with that error', async () => {
    const network = new Error('network')
    fake.state.results = [network]
    await expect(createMeal(record, CLIENT_KEY)).rejects.toBe(network)
    expect(fake.state.chains).toHaveLength(1)
  })

  it.each([
    ['null', null],
    ['a number', 42],
    ['an object', { id: MEAL_ID }],
    ['a string that is not a UUID', 'abc'],
  ])('an answer without a valid id (%s) throws', async (_, data) => {
    fake.state.results = [{ data, error: null }]
    await expect(createMeal(record, CLIENT_KEY)).rejects.toThrow()
    expect(fake.state.chains).toHaveLength(1)
  })

  it('returns the id create_meal returned', async () => {
    const otherId = '00000000-0000-4000-8000-0000000000bb'
    fake.state.results = [{ data: otherId, error: null }]
    await expect(createMeal(record, CLIENT_KEY)).resolves.toBe(otherId)
  })
})

// --- The history (spec §6.7, §14 #47) ---

function callsOf(index: number, method: string): unknown[][] {
  return (
    fake.state.chains[index]?.calls
      .filter((c) => c.method === method)
      .map((c) => c.args) ?? []
  )
}

/** A row of the list, as PostgREST returns it (with the filtering embed). */
function listRow(n: number): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    eaten_at: '2026-11-14T16:05:00+00:00',
    total_carbs_g: 30,
    calculated_dose_units: 2,
    applied_dose_units: 2,
    meal_items: [
      { position: 1, food_name: 'Pollo de prueba' },
      { position: 0, food_name: 'Arroz de prueba' },
    ],
  }
}

function listRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, n) => listRow(n))
}

describe('fetchMealsPage', () => {
  it('builds the query: not deleted, with items, most recent first', async () => {
    fake.state.results = [{ data: [], error: null }]
    await fetchMealsPage(0)

    expect(fake.state.chains).toHaveLength(1)
    expect(fake.state.chains[0]?.table).toBe('meals')
    expect(methods(0)).toEqual(['select', 'is', 'order', 'order', 'range'])
    const columns = argsOf(0, 'select')?.[0] as string
    expect(columns).toBe(
      'id, eaten_at, total_carbs_g, calculated_dose_units, applied_dose_units, meal_items!inner(position, food_name)',
    )
    expect(argsOf(0, 'is')).toEqual(['deleted_at', null])
    expect(callsOf(0, 'order')).toEqual([
      ['eaten_at', { ascending: false }],
      ['created_at', { ascending: false }],
    ])
  })

  it('asks for one row more than the page, from the offset', async () => {
    expect(MEALS_PAGE_SIZE).toBe(50)
    fake.state.results = [
      { data: [], error: null },
      { data: [], error: null },
    ]
    await fetchMealsPage(0)
    await fetchMealsPage(100)
    expect(argsOf(0, 'range')).toEqual([0, 50])
    expect(argsOf(1, 'range')).toEqual([100, 150])
  })

  it('51 rows: returns 50 and says there is more', async () => {
    fake.state.results = [{ data: listRows(51), error: null }]
    const page = await fetchMealsPage(0)
    expect(page.meals).toHaveLength(50)
    expect(page.meals[49]?.id).toBe(listRow(49).id)
    expect(page.hasMore).toBe(true)
  })

  it('50 rows: returns 50 and says there is no more', async () => {
    fake.state.results = [{ data: listRows(50), error: null }]
    const page = await fetchMealsPage(0)
    expect(page.meals).toHaveLength(50)
    expect(page.hasMore).toBe(false)
  })

  it('0 rows: an empty page', async () => {
    fake.state.results = [{ data: [], error: null }]
    await expect(fetchMealsPage(0)).resolves.toEqual({
      meals: [],
      hasMore: false,
    })
  })

  it('keeps the names of the foods, as the base returns them', async () => {
    fake.state.results = [{ data: [listRow(0)], error: null }]
    const page = await fetchMealsPage(0)
    expect(page.meals[0]?.meal_items).toEqual([
      { position: 1, food_name: 'Pollo de prueba' },
      { position: 0, food_name: 'Arroz de prueba' },
    ])
  })

  it('drops unknown columns of the items', async () => {
    fake.state.results = [
      {
        data: [
          {
            ...listRow(0),
            meal_items: [{ position: 0, food_name: 'Arroz', id: 'x' }],
          },
        ],
        error: null,
      },
    ]
    const page = await fetchMealsPage(0)
    expect(page.meals[0]?.meal_items).toEqual([
      { position: 0, food_name: 'Arroz' },
    ])
  })

  it.each([
    ['without items', []],
    ['without the embed', undefined],
    ['a name that is not text', [{ position: 0, food_name: null }]],
    ['without a name', [{ position: 0 }]],
    ['a position that is not a number', [{ position: '0', food_name: 'A' }]],
  ])('a meal %s throws', async (_, items) => {
    fake.state.results = [
      { data: [{ ...listRow(0), meal_items: items }], error: null },
    ]
    await expect(fetchMealsPage(0)).rejects.toThrow()
  })

  it('data null throws', async () => {
    fake.state.results = [{ data: null, error: null }]
    await expect(fetchMealsPage(0)).rejects.toThrow()
  })

  it('an invalid row throws', async () => {
    fake.state.results = [
      { data: [{ ...listRow(0), total_carbs_g: '30' }], error: null },
    ]
    await expect(fetchMealsPage(0)).rejects.toThrow()
  })

  it('throws the Supabase error as is', async () => {
    const error = { message: 'JWT expired', code: 'PGRST301' }
    fake.state.results = [{ data: null, error }]
    await expect(fetchMealsPage(0)).rejects.toBe(error)
  })
})

const savedRow = {
  id: MEAL_ID,
  eaten_at: '2026-11-14T16:05:00.123+00:00',
  carb_ratio_g_per_unit: 15,
  total_carbs_g: 99.24,
  calculated_dose_units: 6.616,
  applied_dose_units: 6.5,
  meal_items: record.items.map((item) => ({
    position: item.position,
    food_id: 'id' in item.food ? item.food.id : '',
    food_name: item.food_name,
    food_brand: item.food_brand,
    food_state: item.food_state,
    quantity_mode: item.quantity_mode,
    units: item.units,
    unit_weight_g: item.unit_weight_g,
    grams: item.grams,
    carbs_per_100g: item.carbs_per_100g,
    cooking_factor: item.cooking_factor,
    effective_carbs_per_100g: item.effective_carbs_per_100g,
    carbs_g: item.carbs_g,
  })),
}

describe('fetchMeal', () => {
  it.each(['abc', '', '1', `${MEAL_ID}x`])(
    'an id that is not a UUID (%j) is null, without querying',
    async (id) => {
      await expect(fetchMeal(id)).resolves.toBeNull()
      expect(fake.state.chains).toHaveLength(0)
    },
  )

  it('builds the query: that meal, not deleted, its items in order', async () => {
    fake.state.results = [{ data: savedRow, error: null }]
    await fetchMeal(MEAL_ID)

    expect(fake.state.chains[0]?.table).toBe('meals')
    expect(methods(0)).toEqual(['select', 'eq', 'is', 'order', 'maybeSingle'])
    const columns = argsOf(0, 'select')?.[0] as string
    expect(columns).toContain('carb_ratio_g_per_unit')
    expect(columns).toContain(
      'meal_items!inner(position, food_id, food_name, food_brand, food_state, quantity_mode, units, unit_weight_g, grams, carbs_per_100g, cooking_factor, effective_carbs_per_100g, carbs_g)',
    )
    expect(columns).not.toContain('calc_version')
    expect(argsOf(0, 'eq')).toEqual(['id', MEAL_ID])
    expect(argsOf(0, 'is')).toEqual(['deleted_at', null])
    expect(argsOf(0, 'order')).toEqual([
      'position',
      { referencedTable: 'meal_items' },
    ])
  })

  it('no row (deleted, another user’s or without items) is null', async () => {
    fake.state.results = [{ data: null, error: null }]
    await expect(fetchMeal(MEAL_ID)).resolves.toBeNull()
  })

  it('a valid row is returned parsed', async () => {
    fake.state.results = [{ data: savedRow, error: null }]
    await expect(fetchMeal(MEAL_ID)).resolves.toEqual(savedRow)
  })

  it('a row with no items throws', async () => {
    fake.state.results = [
      { data: { ...savedRow, meal_items: [] }, error: null },
    ]
    await expect(fetchMeal(MEAL_ID)).rejects.toThrow()
  })

  it('an item with an unknown state throws', async () => {
    const [first] = savedRow.meal_items
    fake.state.results = [
      {
        data: { ...savedRow, meal_items: [{ ...first, food_state: 'cooked' }] },
        error: null,
      },
    ]
    await expect(fetchMeal(MEAL_ID)).rejects.toThrow()
  })

  it('throws the Supabase error as is', async () => {
    const error = { message: 'x', code: '500' }
    fake.state.results = [{ data: null, error }]
    await expect(fetchMeal(MEAL_ID)).rejects.toBe(error)
  })
})

describe('fetchMeal: the id', () => {
  it.each([
    // Postgres reads a UUID in capitals as the same one.
    MEAL_ID.toUpperCase(),
    // Not version 4: still a valid uuid for Postgres.
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ])('%s is queried as is', async (id) => {
    fake.state.results = [{ data: { ...savedRow, id: MEAL_ID }, error: null }]
    await expect(fetchMeal(id)).resolves.toEqual(savedRow)
    expect(fake.state.chains).toHaveLength(1)
    expect(argsOf(0, 'eq')).toEqual(['id', id])
  })

  it.each([
    ` ${MEAL_ID}`,
    `${MEAL_ID} `,
    `{${MEAL_ID}}`,
    MEAL_ID.replaceAll('-', ''),
    MEAL_ID.slice(0, -1),
    MEAL_ID.replace('a', 'g'),
    `${MEAL_ID}/`,
  ])('%j is null, without querying', async (id) => {
    await expect(fetchMeal(id)).resolves.toBeNull()
    expect(fake.state.chains).toHaveLength(0)
  })
})

describe('fetchMealsPage: bordes', () => {
  it('the second page asks for 50 to 100', async () => {
    fake.state.results = [{ data: [], error: null }]
    await fetchMealsPage(50)
    expect(argsOf(0, 'range')).toEqual([50, 100])
  })

  it('51 rows: the extra one is not returned', async () => {
    fake.state.results = [{ data: listRows(51), error: null }]
    const page = await fetchMealsPage(0)
    expect(page.meals.map((m) => m.id)).not.toContain(listRow(50).id)
    expect(page.meals.map((m) => m.id)).toEqual(
      listRows(50).map((row) => row.id),
    )
  })

  it('1 row: one meal and no more', async () => {
    fake.state.results = [{ data: [listRow(0)], error: null }]
    const page = await fetchMealsPage(0)
    expect(page.meals).toHaveLength(1)
    expect(page.hasMore).toBe(false)
  })

  it('49 rows: no more', async () => {
    fake.state.results = [{ data: listRows(49), error: null }]
    const page = await fetchMealsPage(0)
    expect(page.meals).toHaveLength(49)
    expect(page.hasMore).toBe(false)
  })

  it('keeps the order the base returns', async () => {
    const rows = [listRow(2), listRow(0), listRow(1)]
    fake.state.results = [{ data: rows, error: null }]
    const page = await fetchMealsPage(0)
    expect(page.meals.map((m) => m.id)).toEqual(rows.map((row) => row.id))
  })

  it('a rejected request rejects', async () => {
    const network = new Error('network')
    fake.state.results = [network]
    await expect(fetchMealsPage(0)).rejects.toBe(network)
  })
})

describe('deleteMeal', () => {
  it('updates only deleted_at, with the current date, of that meal', async () => {
    fake.state.results = [{ data: { id: MEAL_ID }, error: null }]
    const before = Date.now()
    await expect(deleteMeal(MEAL_ID)).resolves.toBeUndefined()
    const after = Date.now()

    expect(fake.state.chains).toHaveLength(1)
    expect(fake.state.chains[0]?.table).toBe('meals')
    expect(methods(0)).toEqual(['update', 'eq', 'select', 'single'])
    const payload = argsOf(0, 'update')?.[0] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['deleted_at'])
    const sent = Date.parse(payload.deleted_at as string)
    expect(sent).toBeGreaterThanOrEqual(before)
    expect(sent).toBeLessThanOrEqual(after)
    expect(callsOf(0, 'eq')).toEqual([['id', MEAL_ID]])
    expect(argsOf(0, 'select')).toEqual(['id'])
  })

  it('is not filtered by deleted_at (deleting again overwrites the date)', async () => {
    fake.state.results = [{ data: { id: MEAL_ID }, error: null }]
    await deleteMeal(MEAL_ID)
    expect(methods(0)).not.toContain('is')
  })

  it('throws the Supabase error as is (for example, no row updated)', async () => {
    const error = { message: 'x', code: 'PGRST116' }
    fake.state.results = [{ data: null, error }]
    await expect(deleteMeal(MEAL_ID)).rejects.toBe(error)
  })

  it('a rejected request rejects', async () => {
    const network = new Error('network')
    fake.state.results = [network]
    await expect(deleteMeal(MEAL_ID)).rejects.toBe(network)
  })
})

// --- Reference table (spec §6.2, §14 #51) ---

// Invented code and values.
const refRow = {
  reference_db: 'usda_fdc',
  reference_code: '900001',
  description_original: 'Invented banana, raw',
  name_es: 'Banana',
  state: 'as_eaten',
  carbs_per_100g: 20.229999999999997,
}

describe('fetchReferenceFoods', () => {
  it('reads the USDA rows with their columns and validates them', async () => {
    fake.state.results = [{ data: [refRow], error: null }]
    await expect(fetchReferenceFoods()).resolves.toEqual([refRow])
    expect(fake.state.chains[0]?.table).toBe('reference_foods')
    expect(methods(0)).toEqual(['select', 'eq', 'eq'])
    expect(argsOf(0, 'select')).toEqual([
      'reference_db, reference_code, description_original, name_es, state, carbs_per_100g',
    ])
    const eqCalls = fake.state.chains[0]?.calls
      .filter((c) => c.method === 'eq')
      .map((c) => c.args)
    expect(eqCalls).toEqual([
      ['reference_db', 'usda_fdc'],
      ['state', 'as_eaten'],
    ])
  })

  it('keeps the binary noise of the HC exactly (tester)', async () => {
    fake.state.results = [
      {
        data: [{ ...refRow, carbs_per_100g: 11.459999999999999 }],
        error: null,
      },
    ]
    const [row] = await fetchReferenceFoods()
    expect(row?.carbs_per_100g).toBe(11.459999999999999)
    expect(row?.carbs_per_100g).not.toBe(11.46)
  })

  it('an empty table is an empty list', async () => {
    fake.state.results = [{ data: [], error: null }]
    await expect(fetchReferenceFoods()).resolves.toEqual([])
  })

  it('a raw_cooked row (the query filters them out) throws', async () => {
    fake.state.results = [
      { data: [refRow, { ...refRow, state: 'raw_cooked' }], error: null },
    ]
    await expect(fetchReferenceFoods()).rejects.toThrow()
  })

  it('an invalid row throws', async () => {
    fake.state.results = [
      { data: [refRow, { ...refRow, carbs_per_100g: 'x' }], error: null },
    ]
    await expect(fetchReferenceFoods()).rejects.toThrow()
  })

  it('a Supabase error is thrown as is', async () => {
    const error = { message: 'JWT expired', code: 'PGRST301' }
    fake.state.results = [{ data: null, error }]
    await expect(fetchReferenceFoods()).rejects.toBe(error)
  })
})

describe('createMeal with foods of the reference table', () => {
  const COPY_ID = '00000000-0000-4000-8000-0000000000c1'
  const NEW_COPY_ID = '00000000-0000-4000-8000-0000000000c2'
  const CATALOG_ID = '00000000-0000-4000-8000-000000000002'

  const copy: NewTableFood = {
    name: 'Banana',
    brand: null,
    source: 'reference',
    state: 'as_eaten',
    carbs_per_100g: 20.229999999999997,
    reference_db: 'usda_fdc',
    reference_code: '900001',
    reference_description: 'Invented banana, raw',
  }

  const catalogItem: NewMealItem = {
    food: { id: CATALOG_ID },
    position: 0,
    food_name: 'Arroz de prueba',
    food_brand: null,
    food_source: 'manual',
    food_state: 'raw_cooked',
    quantity_mode: 'grams',
    units: null,
    unit_weight_g: null,
    grams: 250,
    carbs_per_100g: 78,
    cooking_factor: 2.6,
    effective_carbs_per_100g: 30,
    carbs_g: 75,
  }

  function tableItem(position: number, grams = 120): NewMealItem {
    return {
      ...catalogItem,
      food: { copy },
      position,
      food_name: 'Banana',
      food_source: 'reference',
      food_state: 'as_eaten',
      grams,
      carbs_per_100g: copy.carbs_per_100g,
      cooking_factor: null,
      effective_carbs_per_100g: copy.carbs_per_100g,
      carbs_g: (grams * copy.carbs_per_100g) / 100,
    }
  }

  const withItems = (items: NewMealItem[]): NewMealRecord => ({
    meal: record.meal,
    items,
  })

  const tables = () => fake.state.chains.map((chain) => chain.table)

  it('finds the existing copy: one select, no insert in foods', async () => {
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    await expect(
      createMeal(withItems([tableItem(0)]), CLIENT_KEY),
    ).resolves.toBe(MEAL_ID)

    expect(tables()).toEqual(['foods', 'rpc:create_meal'])
    expect(methods(0)).toEqual([
      'select',
      'eq',
      'eq',
      'eq',
      'is',
      'order',
      'limit',
      'maybeSingle',
    ])
    expect(argsOf(0, 'select')).toEqual(['id'])
    const eqs = fake.state.chains[0]?.calls
      .filter((c) => c.method === 'eq')
      .map((c) => c.args)
    expect(eqs).toEqual([
      ['source', 'reference'],
      ['reference_db', 'usda_fdc'],
      ['reference_code', '900001'],
    ])
    expect(argsOf(0, 'is')).toEqual(['archived_at', null])
    expect(argsOf(0, 'order')).toEqual(['created_at'])
    expect(argsOf(0, 'limit')).toEqual([1])

    const rows = payloadOf(1).items
    expect(rows).toHaveLength(1)
    expect(rows[0]?.food_id).toBe(COPY_ID)
    expect(Object.keys(rows[0] ?? {})).not.toContain('meal_id')
    expect(Object.keys(rows[0] ?? {})).not.toContain('food')
  })

  it('without a copy, inserts it (without user_id) and uses the new id', async () => {
    fake.state.results = [
      { data: null, error: null },
      { data: { id: NEW_COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    await expect(
      createMeal(withItems([tableItem(0)]), CLIENT_KEY),
    ).resolves.toBe(MEAL_ID)

    expect(tables()).toEqual(['foods', 'foods', 'rpc:create_meal'])
    expect(methods(1)).toEqual(['insert', 'select', 'single'])
    const inserted = argsOf(1, 'insert')?.[0] as Record<string, unknown>
    expect(inserted).toEqual(copy)
    expect(Object.keys(inserted)).not.toContain('user_id')
    expect(argsOf(1, 'select')).toEqual(['id'])

    const rows = payloadOf(2).items
    expect(rows[0]?.food_id).toBe(NEW_COPY_ID)
  })

  it('the same entry twice is resolved once', async () => {
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    await createMeal(
      withItems([tableItem(0, 120), tableItem(1, 80)]),
      CLIENT_KEY,
    )
    expect(tables()).toEqual(['foods', 'rpc:create_meal'])
    const rows = payloadOf(1).items
    expect(rows.map((r) => r.food_id)).toEqual([COPY_ID, COPY_ID])
    expect(rows.map((r) => r.grams)).toEqual([120, 80])
  })

  it('a mixed meal: each item gets its food, in order', async () => {
    const otherCopy: NewTableFood = {
      ...copy,
      name: 'Arroz blanco hervido',
      reference_code: '900002',
    }
    const rice: NewMealItem = { ...tableItem(2), food: { copy: otherCopy } }
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: null, error: null },
      { data: { id: NEW_COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    await createMeal(
      withItems([tableItem(0), { ...catalogItem, position: 1 }, rice]),
      CLIENT_KEY,
    )
    expect(tables()).toEqual(['foods', 'foods', 'foods', 'rpc:create_meal'])
    expect(fake.state.chains[1]?.calls).toContainEqual({
      method: 'eq',
      args: ['reference_code', '900002'],
    })
    expect(argsOf(2, 'insert')?.[0]).toEqual(otherCopy)
    const rows = payloadOf(3).items
    expect(rows.map((r) => r.food_id)).toEqual([
      COPY_ID,
      CATALOG_ID,
      NEW_COPY_ID,
    ])
  })

  it('a meal only of catalog foods never touches foods', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    await createMeal(withItems([catalogItem]), CLIENT_KEY)
    expect(tables()).toEqual(['rpc:create_meal'])
  })

  it('if looking for the copy fails, throws and does not insert the meal', async () => {
    const error = { message: 'x', code: '500' }
    fake.state.results = [{ data: null, error }]
    await expect(
      createMeal(withItems([tableItem(0)]), CLIENT_KEY),
    ).rejects.toBe(error)
    expect(tables()).toEqual(['foods'])
  })

  it('if looking for the copy rejects, throws and does not insert the meal', async () => {
    const network = new Error('network')
    fake.state.results = [network]
    await expect(
      createMeal(withItems([tableItem(0)]), CLIENT_KEY),
    ).rejects.toBe(network)
    expect(tables()).toEqual(['foods'])
  })

  it('if inserting the copy fails, throws and does not insert the meal', async () => {
    const error = { message: 'x', code: '23514' }
    fake.state.results = [
      { data: null, error: null },
      { data: null, error },
    ]
    await expect(
      createMeal(withItems([tableItem(0)]), CLIENT_KEY),
    ).rejects.toBe(error)
    expect(tables()).toEqual(['foods', 'foods'])
  })

  it('if the second copy fails, the first stays and the meal is not inserted', async () => {
    const error = new Error('network')
    const rice: NewMealItem = {
      ...tableItem(1),
      food: { copy: { ...copy, reference_code: '900002' } },
    }
    fake.state.results = [
      { data: null, error: null },
      { data: { id: NEW_COPY_ID }, error: null },
      error,
    ]
    await expect(
      createMeal(withItems([tableItem(0), rice]), CLIENT_KEY),
    ).rejects.toBe(error)
    expect(tables()).toEqual(['foods', 'foods', 'foods'])
    // Nothing is undone in foods.
    const all = fake.state.chains.flatMap((c) => c.calls.map((x) => x.method))
    expect(all).not.toContain('update')
  })

  it('a copy found or inserted without an id throws, without the meal', async () => {
    fake.state.results = [{ data: { other: 1 }, error: null }]
    await expect(
      createMeal(withItems([tableItem(0)]), CLIENT_KEY),
    ).rejects.toThrow()
    expect(tables()).toEqual(['foods'])

    fake.state.chains = []
    fake.state.results = [
      { data: null, error: null },
      { data: null, error: null },
    ]
    await expect(
      createMeal(withItems([tableItem(0)]), CLIENT_KEY),
    ).rejects.toThrow()
    expect(tables()).toEqual(['foods', 'foods'])
  })

  it('does not modify the record', async () => {
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    const twice = withItems([tableItem(0), tableItem(1)])
    const before = structuredClone(twice)
    await createMeal(twice, CLIENT_KEY)
    expect(twice).toEqual(before)
  })

  it('three items with two codes: resolved in order, once per code (tester)', async () => {
    const rice: NewMealItem = {
      ...tableItem(1),
      food: { copy: { ...copy, name: 'Arroz', reference_code: '900002' } },
    }
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: { id: NEW_COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    await createMeal(
      withItems([tableItem(0), rice, tableItem(2, 50)]),
      CLIENT_KEY,
    )
    expect(tables()).toEqual(['foods', 'foods', 'rpc:create_meal'])
    const codeOf = (i: number) =>
      fake.state.chains[i]?.calls.find(
        (c) => c.method === 'eq' && c.args[0] === 'reference_code',
      )?.args[1]
    expect([codeOf(0), codeOf(1)]).toEqual(['900001', '900002'])
    const rows = payloadOf(2).items
    expect(rows.map((r) => r.food_id)).toEqual([COPY_ID, NEW_COPY_ID, COPY_ID])
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2])
  })

  it('a table item and a catalog item that is its copy: one lookup, both rows (tester)', async () => {
    const copyItem: NewMealItem = {
      ...tableItem(1, 60),
      food: { id: COPY_ID },
      // The catalog copy was edited: other HC.
      carbs_per_100g: 25,
      effective_carbs_per_100g: 25,
      carbs_g: 15,
    }
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    await createMeal(withItems([tableItem(0), copyItem]), CLIENT_KEY)
    expect(tables()).toEqual(['foods', 'rpc:create_meal'])
    const rows = payloadOf(1).items
    expect(rows.map((r) => r.food_id)).toEqual([COPY_ID, COPY_ID])
    expect(rows.map((r) => r.carbs_per_100g)).toEqual([copy.carbs_per_100g, 25])
  })

  it('the saved row keeps the values shown, whatever the copy found has (tester)', async () => {
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    const item = tableItem(0, 133)
    await createMeal(withItems([item]), CLIENT_KEY)
    // The lookup only asks for the id: nothing of the copy enters the row.
    expect(argsOf(0, 'select')).toEqual(['id'])
    const rows = payloadOf(1).items
    const { food: _food, ...expected } = item
    expect(rows).toEqual([{ ...expected, food_id: COPY_ID }])
    expect(rows[0]?.food_source).toBe('reference')
  })

  it('the meal is saved only after every copy is resolved (tester)', async () => {
    const rice: NewMealItem = {
      ...tableItem(1),
      food: { copy: { ...copy, reference_code: '900002' } },
    }
    fake.state.results = [
      { data: null, error: null },
      { data: { id: NEW_COPY_ID }, error: null },
      { data: null, error: null },
      { data: { id: COPY_ID }, error: null },
      { data: MEAL_ID, error: null },
    ]
    await createMeal(withItems([tableItem(0), rice]), CLIENT_KEY)
    expect(tables()).toEqual([
      'foods',
      'foods',
      'foods',
      'foods',
      'rpc:create_meal',
    ])
  })
})

// --- The shortcuts of Inicio and "Corregir" (spec §6.6, §6.7) ---

describe('fetchRecentMeals', () => {
  const recentRow = {
    id: MEAL_ID,
    eaten_at: '2026-11-14T16:05:00+00:00',
    total_carbs_g: 99.24,
    meal_items: [
      {
        position: 0,
        food_id: '00000000-0000-4000-8000-000000000001',
        food_name: 'Arroz de prueba',
        quantity_mode: 'grams',
        units: null,
        grams: 250,
      },
    ],
  }

  it('reads the last 30 meals as the history lists them, with what repeating needs', async () => {
    fake.state.results = [{ data: [recentRow], error: null }]
    await expect(fetchRecentMeals()).resolves.toEqual([recentRow])

    expect(RECENT_MEALS_LIMIT).toBe(30)
    expect(fake.state.chains[0]?.table).toBe('meals')
    expect(methods(0)).toEqual(['select', 'is', 'order', 'order', 'limit'])
    expect(argsOf(0, 'select')).toEqual([
      'id, eaten_at, total_carbs_g, meal_items!inner(position, food_id, food_name, quantity_mode, units, grams)',
    ])
    expect(argsOf(0, 'is')).toEqual(['deleted_at', null])
    expect(callsOf(0, 'order')).toEqual([
      ['eaten_at', { ascending: false }],
      ['created_at', { ascending: false }],
    ])
    expect(argsOf(0, 'limit')).toEqual([RECENT_MEALS_LIMIT])
  })

  it('an invalid row throws', async () => {
    fake.state.results = [
      { data: [{ ...recentRow, meal_items: [] }], error: null },
    ]
    await expect(fetchRecentMeals()).rejects.toThrow()
  })

  it('throws the Supabase error as is', async () => {
    const error = { message: 'JWT expired', code: 'PGRST301' }
    fake.state.results = [{ data: null, error }]
    await expect(fetchRecentMeals()).rejects.toBe(error)
  })
})

describe('saveMeal', () => {
  const NEW_ID = '00000000-0000-4000-8000-0000000000bb'

  it('a new meal: only createMeal', async () => {
    fake.state.results = [{ data: NEW_ID, error: null }]
    await expect(
      saveMeal({ record, replaces: null, clientKey: CLIENT_KEY }),
    ).resolves.toEqual({
      id: NEW_ID,
      replacedDeleted: null,
    })
    expect(fake.state.chains.map((chain) => chain.table)).toEqual([
      'rpc:create_meal',
    ])
  })

  it('a correction: first creates the new meal, then deletes the corrected one', async () => {
    fake.state.results = [
      { data: NEW_ID, error: null },
      { data: { id: MEAL_ID }, error: null },
    ]
    const before = Date.now()
    await expect(
      saveMeal({ record, replaces: MEAL_ID, clientKey: CLIENT_KEY }),
    ).resolves.toEqual({
      id: NEW_ID,
      replacedDeleted: true,
    })
    const after = Date.now()

    expect(fake.state.chains.map((chain) => chain.table)).toEqual([
      'rpc:create_meal',
      'meals',
    ])
    expect(payloadOf(0).items).toEqual(catalogRows(record.items))
    expect(methods(1)).toEqual(['update', 'eq', 'select', 'single'])
    const payload = argsOf(1, 'update')?.[0] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['deleted_at'])
    const sent = Date.parse(payload.deleted_at as string)
    expect(sent).toBeGreaterThanOrEqual(before)
    expect(sent).toBeLessThanOrEqual(after)
    expect(argsOf(1, 'eq')).toEqual(['id', MEAL_ID])
  })

  it('if creating fails, its error is thrown and nothing is deleted', async () => {
    const error = { message: 'x', code: '23514' }
    fake.state.results = [{ data: null, error }]
    await expect(
      saveMeal({ record, replaces: MEAL_ID, clientKey: CLIENT_KEY }),
    ).rejects.toBe(error)
    expect(fake.state.chains.map((chain) => chain.table)).toEqual([
      'rpc:create_meal',
    ])
  })

  it('if creating rejects (the network), nothing is deleted', async () => {
    const network = new Error('network')
    fake.state.results = [network]
    await expect(
      saveMeal({ record, replaces: MEAL_ID, clientKey: CLIENT_KEY }),
    ).rejects.toBe(network)
    expect(fake.state.chains).toHaveLength(1)
  })

  it.each([
    [
      'no row updated (gone, or another user\x27s)',
      { data: null, error: { message: 'x', code: 'PGRST116' } },
    ],
    ['a Supabase error', { data: null, error: { message: 'x', code: '500' } }],
    ['the network', new Error('network')],
  ])(
    'if deleting the corrected meal fails (%s), the new meal stays saved',
    async (_, deleteResult) => {
      fake.state.results = [{ data: NEW_ID, error: null }, deleteResult]
      await expect(
        saveMeal({ record, replaces: MEAL_ID, clientKey: CLIENT_KEY }),
      ).resolves.toEqual({
        id: NEW_ID,
        replacedDeleted: false,
      })
      expect(fake.state.chains).toHaveLength(2)
    },
  )

  it('sends the key of the meal in progress, in a new meal and in a correction', async () => {
    fake.state.results = [
      { data: NEW_ID, error: null },
      { data: NEW_ID, error: null },
      { data: { id: MEAL_ID }, error: null },
    ]
    await saveMeal({ record, replaces: null, clientKey: CLIENT_KEY })
    await saveMeal({ record, replaces: MEAL_ID, clientKey: CLIENT_KEY })
    expect(payloadOf(0).meal.client_key).toBe(CLIENT_KEY)
    expect(payloadOf(1).meal.client_key).toBe(CLIENT_KEY)
  })

  it('a retry of a correction (same key) ends well: create_meal gives the meal already created and the corrected one, already deleted, is deleted again', async () => {
    // The first attempt saved both, but its answer was lost. The retry gets
    // the same id, and deleting the corrected one is not filtered by
    // deleted_at, so the row comes back.
    fake.state.results = [
      { data: NEW_ID, error: null },
      { data: { id: MEAL_ID }, error: null },
    ]
    await expect(
      saveMeal({ record, replaces: MEAL_ID, clientKey: CLIENT_KEY }),
    ).resolves.toEqual({ id: NEW_ID, replacedDeleted: true })
    expect(fake.state.chains[1]?.calls.map((c) => c.method)).not.toContain('is')
  })
})

describe('createMeal: the key of the meal', () => {
  it('goes in meal.client_key, as given, without touching the record', async () => {
    fake.state.results = [{ data: MEAL_ID, error: null }]
    const before = structuredClone(record)
    await createMeal(record, CLIENT_KEY)
    expect(payloadOf(0).meal).toEqual({
      ...record.meal,
      client_key: CLIENT_KEY,
    })
    expect(record).toEqual(before)
  })
})

/** A failed call to the function, as functions-js returns it. */
function httpError(status: number, body: string): FunctionsHttpError {
  return new FunctionsHttpError(
    new Response(body, {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function errorBody(code: string, retryable?: boolean): string {
  return JSON.stringify({ ok: false, error: { code, retryable } })
}

describe('fetchLatestGlucose', () => {
  // Invented reading.
  const reading = {
    mgdl: 118,
    trend: 'steady',
    measured_at: '2026-11-27T15:05:00.000Z',
  }

  it('calls glucose-latest and returns the validated reading', async () => {
    fake.state.invokeResult = { data: { ok: true, reading }, error: null }
    await expect(fetchLatestGlucose()).resolves.toEqual(reading)
    expect(fake.state.invokeCalls).toEqual([
      ['glucose-latest', { timeout: 45_000 }],
    ])
  })

  it('a sensor without a reading gives null', async () => {
    fake.state.invokeResult = { data: { ok: true, reading: null }, error: null }
    await expect(fetchLatestGlucose()).resolves.toBeNull()
  })

  it.each([
    ['a decimal value', { ...reading, mgdl: 118.5 }],
    ['an unknown trend', { ...reading, trend: 'up' }],
    ['a date that is not ISO', { ...reading, measured_at: '11/27/2026' }],
  ])('a 200 with %s throws', async (_label, bad) => {
    fake.state.invokeResult = { data: { ok: true, reading: bad }, error: null }
    await expect(fetchLatestGlucose()).rejects.toThrow()
  })

  it.each([
    [503, 'GLUCOSE_NOT_CONFIGURED', false],
    [502, 'GLUCOSE_LOGIN_FAILED', false],
    [502, 'GLUCOSE_ACTION_NEEDED', false],
    [502, 'GLUCOSE_NOT_SHARED', false],
    [503, 'GLUCOSE_UNAVAILABLE', true],
  ] as const)(
    '%i %s gives a GlucoseError (retryable %s)',
    async (status, code, retryable) => {
      fake.state.invokeResult = {
        data: null,
        error: httpError(status, errorBody(code, retryable)),
      }
      const error: unknown = await fetchLatestGlucose().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(GlucoseError)
      expect(error).toMatchObject({ code, retryable, retryAt: null })
    },
  )

  it('a wait after a failed login carries when it tries again', async () => {
    const retryAt = '2026-11-27T15:20:05.000Z'
    fake.state.invokeResult = {
      data: null,
      error: httpError(
        502,
        JSON.stringify({
          ok: false,
          error: {
            code: 'GLUCOSE_ACTION_NEEDED',
            retryable: false,
            retry_at: retryAt,
          },
        }),
      ),
    }
    const error: unknown = await fetchLatestGlucose().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GlucoseError)
    expect(error).toMatchObject({ code: 'GLUCOSE_ACTION_NEEDED', retryAt })
  })

  it('a retry_at that is not ISO is thrown as it came', async () => {
    const error = httpError(
      502,
      JSON.stringify({
        ok: false,
        error: {
          code: 'GLUCOSE_LOGIN_FAILED',
          retryable: false,
          retry_at: 'a las tres',
        },
      }),
    )
    fake.state.invokeResult = { data: null, error }
    await expect(fetchLatestGlucose()).rejects.toBe(error)
  })

  it('a 401 gives UnauthorizedError, whatever its body', async () => {
    for (const body of [
      errorBody('UNAUTHORIZED', false),
      JSON.stringify({ msg: 'Invalid JWT' }),
      'not json',
    ]) {
      fake.state.invokeResult = { data: null, error: httpError(401, body) }
      await expect(fetchLatestGlucose()).rejects.toBeInstanceOf(
        UnauthorizedError,
      )
    }
  })

  it.each([
    ['a body that is not JSON', 500, 'not json'],
    ['INTERNAL_ERROR', 500, errorBody('INTERNAL_ERROR', true)],
    ['INVALID_REQUEST', 400, errorBody('INVALID_REQUEST', false)],
    ['a code without retryable', 503, errorBody('GLUCOSE_UNAVAILABLE')],
  ])('%s is thrown as it came', async (_label, status, body) => {
    const error = httpError(status, body)
    fake.state.invokeResult = { data: null, error }
    await expect(fetchLatestGlucose()).rejects.toBe(error)
  })

  it('a network error is thrown as it came', async () => {
    const error = new FunctionsFetchError(new TypeError('Failed to fetch'))
    fake.state.invokeResult = { data: null, error }
    await expect(fetchLatestGlucose()).rejects.toBe(error)
  })
})

// The 24-hour chart (spec §6.10). Invented readings and times.
describe('the reads of the 24-hour chart', () => {
  const NOW = '2026-11-27T15:20:00.000Z'
  const DAY_START = '2026-11-26T15:20:00.000Z'

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('fetchGlucoseDay', () => {
    const rows = [
      { measured_at: '2026-11-27T14:45:00+00:00', mgdl: 112 },
      { measured_at: '2026-11-27T15:00:00+00:00', mgdl: 118 },
    ]

    it('reads the readings of the last 24 hours, oldest first', async () => {
      fake.state.results = [{ data: rows, error: null }]
      await expect(fetchGlucoseDay()).resolves.toEqual(rows)
      expect(fake.state.chains[0]?.table).toBe('glucose_readings')
      expect(methods(0)).toEqual(['select', 'gte', 'order'])
      expect(argsOf(0, 'select')).toEqual(['measured_at, mgdl'])
      expect(argsOf(0, 'gte')).toEqual(['measured_at', DAY_START])
      expect(argsOf(0, 'order')).toEqual(['measured_at', { ascending: true }])
    })

    it('an invalid row throws', async () => {
      fake.state.results = [
        { data: [{ measured_at: 'yesterday', mgdl: 112 }], error: null },
      ]
      await expect(fetchGlucoseDay()).rejects.toThrow()
      fake.state.results = [
        { data: [{ measured_at: rows[0]?.measured_at }], error: null },
      ]
      await expect(fetchGlucoseDay()).rejects.toThrow()
    })

    it('throws the Supabase error as is', async () => {
      const error = { message: 'JWT expired', code: 'PGRST301' }
      fake.state.results = [{ data: null, error }]
      await expect(fetchGlucoseDay()).rejects.toBe(error)
    })
  })

  describe('fetchDayMealTimes', () => {
    it('reads when each meal of the last 24 hours was eaten, without deleted ones', async () => {
      fake.state.results = [
        {
          data: [
            { eaten_at: '2026-11-27T12:00:00+00:00' },
            { eaten_at: '2026-11-27T15:05:00+00:00' },
          ],
          error: null,
        },
      ]
      await expect(fetchDayMealTimes()).resolves.toEqual([
        '2026-11-27T12:00:00+00:00',
        '2026-11-27T15:05:00+00:00',
      ])
      expect(fake.state.chains[0]?.table).toBe('meals')
      expect(methods(0)).toEqual(['select', 'is', 'gte', 'order'])
      // Only the time: the chart shows neither carbs nor doses.
      expect(argsOf(0, 'select')).toEqual(['eaten_at'])
      expect(argsOf(0, 'is')).toEqual(['deleted_at', null])
      expect(argsOf(0, 'gte')).toEqual(['eaten_at', DAY_START])
      expect(argsOf(0, 'order')).toEqual(['eaten_at', { ascending: true }])
    })

    it('an invalid row throws', async () => {
      fake.state.results = [{ data: [{ eaten_at: null }], error: null }]
      await expect(fetchDayMealTimes()).rejects.toThrow()
    })

    it('throws the Supabase error as is', async () => {
      const error = { message: 'JWT expired', code: 'PGRST301' }
      fake.state.results = [{ data: null, error }]
      await expect(fetchDayMealTimes()).rejects.toBe(error)
    })
  })
})
