import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Food } from '../../lib/foods.ts'
import { archiveFood, createFood, updateFood } from './api.ts'
import { toNewFood } from './foodForm.ts'
import type { FoodFormValues } from './types.ts'

// A fake Supabase client that records the query each function builds.
// Only checks the part of the query that matters (spec §6.5): archiving only
// sends archived_at, and editing only the editable columns. fetchFoods is
// tested in lib/foods.test.ts.
const fake = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] }
  const state = {
    table: '',
    calls: [] as Call[],
    result: { data: null as unknown, error: null as unknown },
  }
  function builder(): Record<string, unknown> {
    const b: Record<string, unknown> = {}
    for (const method of ['select', 'is', 'eq', 'update', 'insert', 'single']) {
      b[method] = (...args: unknown[]) => {
        state.calls.push({ method, args })
        return b
      }
    }
    b.then = (resolve: (value: unknown) => unknown) => resolve(state.result)
    return b
  }
  const supabase = {
    from: (table: string) => {
      state.table = table
      return builder()
    },
  }
  return { state, supabase }
})

vi.mock('../../lib/supabase.ts', () => ({ supabase: fake.supabase }))

const food: Food = {
  id: '6f1c2a3b-1111-4222-8333-444455556666',
  name: 'Arroz blanco',
  brand: null,
  source: 'manual',
  state: 'raw_cooked',
  carbs_per_100g: 78,
  cooking_factor: 2.5,
  unit_weight_g: null,
  unit_label: null,
  reference_db: null,
  reference_code: null,
  reference_description: null,
  notes: 'Inventado',
  archived_at: null,
}

beforeEach(() => {
  fake.state.table = ''
  fake.state.calls = []
  fake.state.result = { data: null, error: null }
})

describe('archiveFood', () => {
  it('only sends archived_at, with the current date, for that id', async () => {
    const archived = { ...food, archived_at: '2026-11-13T12:00:00+00:00' }
    fake.state.result = { data: archived, error: null }
    const before = Date.now()
    await expect(archiveFood(food.id)).resolves.toEqual(archived)
    const after = Date.now()

    expect(fake.state.table).toBe('foods')
    const update = fake.state.calls.find((c) => c.method === 'update')
    expect(update).toBeDefined()
    const payload = update?.args[0] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['archived_at'])
    expect(typeof payload.archived_at).toBe('string')
    const sent = Date.parse(payload.archived_at as string)
    expect(sent).toBeGreaterThanOrEqual(before)
    expect(sent).toBeLessThanOrEqual(after)

    expect(fake.state.calls).toContainEqual({
      method: 'eq',
      args: ['id', food.id],
    })
    // Not filtered by archived_at (spec §14 #40): archiving again only
    // overwrites the date.
    expect(fake.state.calls.some((c) => c.method === 'is')).toBe(false)
    expect(fake.state.calls.some((c) => c.method === 'single')).toBe(true)
  })

  it('throws the Supabase error', async () => {
    const error = new Error('boom')
    fake.state.result = { data: null, error }
    await expect(archiveFood(food.id)).rejects.toBe(error)
  })
})

describe('updateFood', () => {
  const values: FoodFormValues = {
    name: 'Arroz de prueba',
    brand: 'Marca Inventada',
    state: 'raw_cooked',
    carbs_per_100g: 78,
    cooking_factor: 2.6,
    unit_weight_g: null,
    unit_label: null,
    notes: null,
  }

  it('only sends the 8 editable columns, for that id', async () => {
    const updated = { ...food, ...values }
    fake.state.result = { data: updated, error: null }
    await expect(updateFood({ id: food.id, values })).resolves.toEqual(updated)

    expect(fake.state.table).toBe('foods')
    const update = fake.state.calls.find((c) => c.method === 'update')
    expect(update?.args[0]).toEqual(values)
    // Never the reference columns (spec §14 #49): the base keeps them.
    expect(Object.keys(update?.args[0] as object).sort()).toEqual(
      [
        'brand',
        'carbs_per_100g',
        'cooking_factor',
        'name',
        'notes',
        'state',
        'unit_label',
        'unit_weight_g',
      ].sort(),
    )
    expect(fake.state.calls).toContainEqual({
      method: 'eq',
      args: ['id', food.id],
    })
    expect(fake.state.calls.some((c) => c.method === 'single')).toBe(true)
  })

  it('does not send extra keys that come in the values', async () => {
    fake.state.result = { data: food, error: null }
    const withExtra = {
      ...values,
      source: 'reference',
      reference_db: 'argenfoods',
      reference_code: 'X-1',
      reference_description: 'Algo',
    } as FoodFormValues
    await updateFood({ id: food.id, values: withExtra })
    const update = fake.state.calls.find((c) => c.method === 'update')
    expect(update?.args[0]).toEqual(values)
  })

  it('switching to "No" sends cooking_factor and the unit as explicit nulls', async () => {
    // Without the keys, the base would keep the old factor of a food that
    // is no longer cooked.
    const asEaten: FoodFormValues = {
      ...values,
      state: 'as_eaten',
      cooking_factor: null,
      brand: null,
    }
    fake.state.result = { data: { ...food, ...asEaten }, error: null }
    await updateFood({ id: food.id, values: asEaten })
    const payload = fake.state.calls.find((c) => c.method === 'update')
      ?.args[0] as Record<string, unknown>
    expect(payload).toHaveProperty('cooking_factor', null)
    expect(payload).toHaveProperty('brand', null)
    expect(payload).toHaveProperty('notes', null)
    expect(payload).toHaveProperty('unit_weight_g', null)
    expect(payload).toHaveProperty('unit_label', null)
    expect(payload).toHaveProperty('state', 'as_eaten')
  })

  it('editing a reference food does not touch its reference columns', async () => {
    const reference: Food = {
      ...food,
      source: 'reference',
      reference_db: 'argenfoods',
      reference_code: 'X-123',
      reference_description: 'Descripción inventada',
    }
    fake.state.result = { data: { ...reference, ...values }, error: null }
    await expect(updateFood({ id: reference.id, values })).resolves.toEqual({
      ...reference,
      ...values,
    })
    const payload = fake.state.calls.find((c) => c.method === 'update')
      ?.args[0] as Record<string, unknown>
    for (const column of [
      'source',
      'reference_db',
      'reference_code',
      'reference_description',
      'photo_path',
      'label_transcription',
      'archived_at',
      'user_id',
    ]) {
      expect(payload).not.toHaveProperty(column)
    }
  })

  it('does not filter by archived_at: an archived food can be edited', async () => {
    fake.state.result = { data: food, error: null }
    await updateFood({ id: food.id, values })
    expect(fake.state.calls.some((c) => c.method === 'is')).toBe(false)
  })

  it('throws the Supabase error', async () => {
    const error = new Error('boom')
    fake.state.result = { data: null, error }
    await expect(updateFood({ id: food.id, values })).rejects.toBe(error)
  })
})

describe('createFood', () => {
  const values: FoodFormValues = {
    name: 'Galletitas de prueba',
    brand: null,
    state: 'as_eaten',
    carbs_per_100g: 68.4,
    cooking_factor: null,
    unit_weight_g: null,
    unit_label: null,
    notes: null,
  }

  it('inserts a manual food without a note or reference columns', async () => {
    const saved = { ...food, ...values, source: 'manual' }
    fake.state.result = { data: saved, error: null }
    await expect(createFood(toNewFood(values))).resolves.toEqual(saved)

    expect(fake.state.table).toBe('foods')
    const insert = fake.state.calls.find((c) => c.method === 'insert')
    const row = insert?.args[0] as Record<string, unknown>
    expect(row).toEqual({ ...values, source: 'manual' })
    // The note is optional (spec §14 #49), sent as null.
    expect(row).toHaveProperty('notes', null)
    // user_id comes from the column default; reference columns stay null.
    for (const column of [
      'user_id',
      'reference_db',
      'reference_code',
      'reference_description',
    ]) {
      expect(row).not.toHaveProperty(column)
    }
    expect(fake.state.calls.some((c) => c.method === 'single')).toBe(true)
  })

  it('throws the Supabase error', async () => {
    const error = new Error('boom')
    fake.state.result = { data: null, error }
    await expect(createFood(toNewFood(values))).rejects.toBe(error)
  })
})
