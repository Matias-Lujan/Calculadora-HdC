import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEALS_PAGE_SIZE,
  createMeal,
  deleteMeal,
  fetchMeal,
  fetchMealsPage,
  fetchReferenceFoods,
} from './api.ts'
import type { NewMealItem, NewMealRecord, NewTableFood } from './types.ts'

// A fake Supabase client. Each from() starts a chain that records its table
// and its calls, and resolves with the next result of a queue (one per
// chain). A result can also be an Error, to make the chain reject.
const fake = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] }
  type Result = { data: unknown; error: unknown } | Error
  type Chain = { table: string; calls: Call[] }
  const state = {
    chains: [] as Chain[],
    results: [] as Result[],
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
  const supabase = {
    from: (table: string) => {
      const chain: Chain = { table, calls: [] }
      state.chains.push(chain)
      const result = state.results.shift() ?? { data: null, error: null }
      return builder(chain, result)
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

/** The meal_items rows createMeal sends for items of the catalog. */
function catalogRows(items: NewMealItem[], mealId: string) {
  return items.map(({ food, ...row }) => {
    if (!('id' in food)) throw new Error('not a catalog item')
    return { ...row, food_id: food.id, meal_id: mealId }
  })
}

function methods(index: number): string[] {
  return fake.state.chains[index]?.calls.map((c) => c.method) ?? []
}

function argsOf(index: number, method: string): unknown[] | undefined {
  return fake.state.chains[index]?.calls.find((c) => c.method === method)?.args
}

beforeEach(() => {
  fake.state.chains = []
  fake.state.results = []
})

describe('createMeal', () => {
  it('inserts the meal, then all its items in one request, and returns the id', async () => {
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await expect(createMeal(record)).resolves.toBe(MEAL_ID)

    expect(fake.state.chains).toHaveLength(2)
    expect(fake.state.chains[0]?.table).toBe('meals')
    expect(methods(0)).toEqual(['insert', 'select', 'single'])
    expect(argsOf(0, 'insert')).toEqual([record.meal])
    expect(argsOf(0, 'select')).toEqual(['id'])

    expect(fake.state.chains[1]?.table).toBe('meal_items')
    expect(methods(1)).toEqual(['insert'])
    const rows = argsOf(1, 'insert')?.[0]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toEqual(catalogRows(record.items, MEAL_ID))
  })

  it('does not modify the record', async () => {
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    const before = structuredClone(record)
    await createMeal(record)
    expect(record).toEqual(before)
  })

  it('if the meal insert fails, throws its error and inserts no items', async () => {
    const error = new Error('meal failed')
    fake.state.results = [{ data: null, error }]
    await expect(createMeal(record)).rejects.toBe(error)
    expect(fake.state.chains).toHaveLength(1)
    expect(methods(0)).not.toContain('update')
  })

  it('if the meal insert rejects, throws and inserts no items', async () => {
    const error = new Error('network')
    fake.state.results = [error]
    await expect(createMeal(record)).rejects.toBe(error)
    expect(fake.state.chains).toHaveLength(1)
  })

  it('if the meal comes back without an id, throws and inserts no items', async () => {
    fake.state.results = [{ data: { other: 1 }, error: null }]
    await expect(createMeal(record)).rejects.toThrow()
    expect(fake.state.chains).toHaveLength(1)
  })

  it('if the meal comes back as null, throws and inserts no items', async () => {
    fake.state.results = [{ data: null, error: null }]
    await expect(createMeal(record)).rejects.toThrow()
    expect(fake.state.chains).toHaveLength(1)
  })

  it('if the items fail, soft-deletes the meal and throws the items error', async () => {
    const itemsError = new Error('items failed')
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: itemsError },
      { data: null, error: null },
    ]
    const before = Date.now()
    await expect(createMeal(record)).rejects.toBe(itemsError)
    const after = Date.now()

    expect(fake.state.chains).toHaveLength(3)
    expect(fake.state.chains[2]?.table).toBe('meals')
    expect(methods(2)).toEqual(['update', 'eq'])
    const payload = argsOf(2, 'update')?.[0] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['deleted_at'])
    expect(typeof payload.deleted_at).toBe('string')
    const sent = Date.parse(payload.deleted_at as string)
    expect(sent).toBeGreaterThanOrEqual(before)
    expect(sent).toBeLessThanOrEqual(after)
    expect(argsOf(2, 'eq')).toEqual(['id', MEAL_ID])
  })

  it('if the items and the soft delete fail, throws the items error', async () => {
    const itemsError = new Error('items failed')
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: itemsError },
      { data: null, error: new Error('update failed') },
    ]
    await expect(createMeal(record)).rejects.toBe(itemsError)
    expect(fake.state.chains).toHaveLength(3)
  })

  it('if the items fail and the soft delete rejects, throws the items error', async () => {
    const itemsError = new Error('items failed')
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: itemsError },
      new Error('network'),
    ]
    await expect(createMeal(record)).rejects.toBe(itemsError)
    expect(fake.state.chains).toHaveLength(3)
  })

  // --- Edge cases added by the tester ---

  it('a meal with one item inserts an array of one row', async () => {
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    const one: NewMealRecord = { ...record, items: record.items.slice(0, 1) }
    await expect(createMeal(one)).resolves.toBe(MEAL_ID)
    expect(fake.state.chains).toHaveLength(2)
    const rows = argsOf(1, 'insert')?.[0]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toEqual(catalogRows(record.items.slice(0, 1), MEAL_ID))
  })

  it('a meal with many items still makes a single items request, in order', async () => {
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    const first = record.items[0]
    if (first === undefined) throw new Error('no item')
    const many: NewMealRecord = {
      ...record,
      items: Array.from({ length: 60 }, (_, position) => ({
        ...first,
        position,
      })),
    }
    await createMeal(many)
    expect(fake.state.chains.map((chain) => chain.table)).toEqual([
      'meals',
      'meal_items',
    ])
    expect(methods(1)).toEqual(['insert'])
    const rows = argsOf(1, 'insert')?.[0] as Record<string, unknown>[]
    expect(rows).toHaveLength(60)
    expect(rows.map((r) => r.position)).toEqual(
      Array.from({ length: 60 }, (_, position) => position),
    )
    expect(rows.every((r) => r.meal_id === MEAL_ID)).toBe(true)
  })

  it('the meal_id of the items is the id the meal insert returned', async () => {
    const otherId = '00000000-0000-4000-8000-0000000000bb'
    fake.state.results = [
      { data: { id: otherId }, error: null },
      { data: null, error: null },
    ]
    await expect(createMeal(record)).resolves.toBe(otherId)
    const rows = argsOf(1, 'insert')?.[0] as Record<string, unknown>[]
    expect(rows.map((r) => r.meal_id)).toEqual([otherId, otherId])
  })

  it('the meal insert is sent without meal_id, deleted_at or user_id', async () => {
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await createMeal(record)
    const payload = argsOf(0, 'insert')?.[0] as Record<string, unknown>
    for (const key of ['meal_id', 'deleted_at', 'user_id', 'id']) {
      expect(Object.keys(payload)).not.toContain(key)
    }
  })

  it('the meal coming back with a non-string id throws, without items', async () => {
    fake.state.results = [{ data: { id: 42 }, error: null }]
    await expect(createMeal(record)).rejects.toThrow()
    expect(fake.state.chains).toHaveLength(1)
  })

  it('the error thrown is the very object Supabase returned', async () => {
    // A PostgrestError-like plain object, not an Error: it is thrown as is,
    // so the 401 handling can read its fields.
    const itemsError = { message: 'x', code: '23514', details: '', hint: '' }
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: itemsError },
      { data: null, error: null },
    ]
    await expect(createMeal(record)).rejects.toBe(itemsError)

    const mealError = { message: 'JWT expired', code: 'PGRST301' }
    fake.state.chains = []
    fake.state.results = [{ data: null, error: mealError }]
    await expect(createMeal(record)).rejects.toBe(mealError)
  })

  it('if the items insert rejects, createMeal rejects with that error', async () => {
    const network = new Error('network')
    fake.state.results = [{ data: { id: MEAL_ID }, error: null }, network]
    await expect(createMeal(record)).rejects.toBe(network)
  })

  it('the soft delete targets only the inserted meal, with a single eq', async () => {
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: new Error('items failed') },
      { data: null, error: null },
    ]
    await expect(createMeal(record)).rejects.toThrow('items failed')
    const eqCalls = fake.state.chains[2]?.calls.filter((c) => c.method === 'eq')
    expect(eqCalls).toEqual([{ method: 'eq', args: ['id', MEAL_ID] }])
    // Nothing is ever inserted or updated in meal_items.
    for (const chain of fake.state.chains) {
      if (chain.table === 'meal_items') {
        expect(chain.calls.map((c) => c.method)).toEqual(['insert'])
      }
    }
  })

  it('a successful save never updates the meal', async () => {
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await createMeal(record)
    for (const chain of fake.state.chains) {
      expect(chain.calls.map((c) => c.method)).not.toContain('update')
    }
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
    meal_items: [{ id: '00000000-0000-4000-8000-0000000000ee' }],
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
    expect(columns.split(',').map((c) => c.trim())).toEqual([
      'id',
      'eaten_at',
      'total_carbs_g',
      'calculated_dose_units',
      'applied_dose_units',
      'meal_items!inner(id)',
    ])
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

  it('drops the meal_items embed', async () => {
    fake.state.results = [{ data: [listRow(0)], error: null }]
    const page = await fetchMealsPage(0)
    expect(Object.keys(page.meals[0] ?? {})).not.toContain('meal_items')
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
      'meal_items!inner(position, food_name, food_brand, food_state, quantity_mode, units, unit_weight_g, grams, carbs_per_100g, cooking_factor, effective_carbs_per_100g, carbs_g)',
    )
    expect(columns).not.toContain('calc_version')
    expect(columns).not.toContain('food_id')
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
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await expect(createMeal(withItems([tableItem(0)]))).resolves.toBe(MEAL_ID)

    expect(tables()).toEqual(['foods', 'meals', 'meal_items'])
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

    const rows = argsOf(2, 'insert')?.[0] as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.food_id).toBe(COPY_ID)
    expect(rows[0]?.meal_id).toBe(MEAL_ID)
    expect(Object.keys(rows[0] ?? {})).not.toContain('food')
  })

  it('without a copy, inserts it (without user_id) and uses the new id', async () => {
    fake.state.results = [
      { data: null, error: null },
      { data: { id: NEW_COPY_ID }, error: null },
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await expect(createMeal(withItems([tableItem(0)]))).resolves.toBe(MEAL_ID)

    expect(tables()).toEqual(['foods', 'foods', 'meals', 'meal_items'])
    expect(methods(1)).toEqual(['insert', 'select', 'single'])
    const inserted = argsOf(1, 'insert')?.[0] as Record<string, unknown>
    expect(inserted).toEqual(copy)
    expect(Object.keys(inserted)).not.toContain('user_id')
    expect(argsOf(1, 'select')).toEqual(['id'])

    const rows = argsOf(3, 'insert')?.[0] as Record<string, unknown>[]
    expect(rows[0]?.food_id).toBe(NEW_COPY_ID)
  })

  it('the same entry twice is resolved once', async () => {
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await createMeal(withItems([tableItem(0, 120), tableItem(1, 80)]))
    expect(tables()).toEqual(['foods', 'meals', 'meal_items'])
    const rows = argsOf(2, 'insert')?.[0] as Record<string, unknown>[]
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
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await createMeal(
      withItems([tableItem(0), { ...catalogItem, position: 1 }, rice]),
    )
    expect(tables()).toEqual(['foods', 'foods', 'foods', 'meals', 'meal_items'])
    expect(fake.state.chains[1]?.calls).toContainEqual({
      method: 'eq',
      args: ['reference_code', '900002'],
    })
    expect(argsOf(2, 'insert')?.[0]).toEqual(otherCopy)
    const rows = argsOf(4, 'insert')?.[0] as Record<string, unknown>[]
    expect(rows.map((r) => r.food_id)).toEqual([
      COPY_ID,
      CATALOG_ID,
      NEW_COPY_ID,
    ])
  })

  it('a meal only of catalog foods never touches foods', async () => {
    fake.state.results = [
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await createMeal(withItems([catalogItem]))
    expect(tables()).toEqual(['meals', 'meal_items'])
  })

  it('if looking for the copy fails, throws and does not insert the meal', async () => {
    const error = { message: 'x', code: '500' }
    fake.state.results = [{ data: null, error }]
    await expect(createMeal(withItems([tableItem(0)]))).rejects.toBe(error)
    expect(tables()).toEqual(['foods'])
  })

  it('if looking for the copy rejects, throws and does not insert the meal', async () => {
    const network = new Error('network')
    fake.state.results = [network]
    await expect(createMeal(withItems([tableItem(0)]))).rejects.toBe(network)
    expect(tables()).toEqual(['foods'])
  })

  it('if inserting the copy fails, throws and does not insert the meal', async () => {
    const error = { message: 'x', code: '23514' }
    fake.state.results = [
      { data: null, error: null },
      { data: null, error },
    ]
    await expect(createMeal(withItems([tableItem(0)]))).rejects.toBe(error)
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
    await expect(createMeal(withItems([tableItem(0), rice]))).rejects.toBe(
      error,
    )
    expect(tables()).toEqual(['foods', 'foods', 'foods'])
    // Nothing is undone in foods.
    const all = fake.state.chains.flatMap((c) => c.calls.map((x) => x.method))
    expect(all).not.toContain('update')
  })

  it('a copy found or inserted without an id throws, without the meal', async () => {
    fake.state.results = [{ data: { other: 1 }, error: null }]
    await expect(createMeal(withItems([tableItem(0)]))).rejects.toThrow()
    expect(tables()).toEqual(['foods'])

    fake.state.chains = []
    fake.state.results = [
      { data: null, error: null },
      { data: null, error: null },
    ]
    await expect(createMeal(withItems([tableItem(0)]))).rejects.toThrow()
    expect(tables()).toEqual(['foods', 'foods'])
  })

  it('does not modify the record', async () => {
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    const twice = withItems([tableItem(0), tableItem(1)])
    const before = structuredClone(twice)
    await createMeal(twice)
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
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await createMeal(withItems([tableItem(0), rice, tableItem(2, 50)]))
    expect(tables()).toEqual(['foods', 'foods', 'meals', 'meal_items'])
    const codeOf = (i: number) =>
      fake.state.chains[i]?.calls.find(
        (c) => c.method === 'eq' && c.args[0] === 'reference_code',
      )?.args[1]
    expect([codeOf(0), codeOf(1)]).toEqual(['900001', '900002'])
    const rows = argsOf(3, 'insert')?.[0] as Record<string, unknown>[]
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
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await createMeal(withItems([tableItem(0), copyItem]))
    expect(tables()).toEqual(['foods', 'meals', 'meal_items'])
    const rows = argsOf(2, 'insert')?.[0] as Record<string, unknown>[]
    expect(rows.map((r) => r.food_id)).toEqual([COPY_ID, COPY_ID])
    expect(rows.map((r) => r.carbs_per_100g)).toEqual([copy.carbs_per_100g, 25])
  })

  it('the saved row keeps the values shown, whatever the copy found has (tester)', async () => {
    fake.state.results = [
      { data: { id: COPY_ID }, error: null },
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    const item = tableItem(0, 133)
    await createMeal(withItems([item]))
    // The lookup only asks for the id: nothing of the copy enters the row.
    expect(argsOf(0, 'select')).toEqual(['id'])
    const rows = argsOf(2, 'insert')?.[0] as Record<string, unknown>[]
    const { food: _food, ...expected } = item
    expect(rows).toEqual([{ ...expected, food_id: COPY_ID, meal_id: MEAL_ID }])
    expect(rows[0]?.food_source).toBe('reference')
  })

  it('the meal is inserted only after every copy is resolved (tester)', async () => {
    const rice: NewMealItem = {
      ...tableItem(1),
      food: { copy: { ...copy, reference_code: '900002' } },
    }
    fake.state.results = [
      { data: null, error: null },
      { data: { id: NEW_COPY_ID }, error: null },
      { data: null, error: null },
      { data: { id: COPY_ID }, error: null },
      { data: { id: MEAL_ID }, error: null },
      { data: null, error: null },
    ]
    await createMeal(withItems([tableItem(0), rice]))
    expect(tables()).toEqual([
      'foods',
      'foods',
      'foods',
      'foods',
      'meals',
      'meal_items',
    ])
  })
})
