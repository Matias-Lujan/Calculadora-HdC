import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMeal } from './api.ts'
import type { NewMealRecord } from './types.ts'

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
    for (const method of ['insert', 'select', 'single', 'update', 'eq']) {
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
      food_id: '00000000-0000-4000-8000-000000000002',
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
      food_id: '00000000-0000-4000-8000-000000000001',
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
    expect(rows).toEqual(
      record.items.map((item) => ({ ...item, meal_id: MEAL_ID })),
    )
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
    expect(rows).toEqual([{ ...record.items[0], meal_id: MEAL_ID }])
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
