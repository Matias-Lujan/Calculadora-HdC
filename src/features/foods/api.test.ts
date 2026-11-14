import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Food } from '../../lib/foods.ts'
import { archiveFood } from './api.ts'

// A fake Supabase client that records the query each function builds.
// Only checks the part of the query that matters for archiving (spec §6.5):
// it only sends archived_at. fetchFoods is tested in lib/foods.test.ts.
const fake = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] }
  const state = {
    table: '',
    calls: [] as Call[],
    result: { data: null as unknown, error: null as unknown },
  }
  function builder(): Record<string, unknown> {
    const b: Record<string, unknown> = {}
    for (const method of ['select', 'is', 'eq', 'update', 'single']) {
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
