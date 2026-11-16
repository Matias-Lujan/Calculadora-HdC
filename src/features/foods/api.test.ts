import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnauthorizedError, VisionError } from '../../lib/errors.ts'
import type { Food } from '../../lib/foods.ts'
import {
  archiveFood,
  createFood,
  createLabelPhotoUrl,
  deleteLabelPhoto,
  transcribeLabel,
  updateFood,
  uploadLabelPhoto,
} from './api.ts'
import { toNewFood } from './foodForm.ts'
import { toNewLabelFood } from './labelForm.ts'
import type { Transcription } from './transcription.ts'
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
    // Storage, functions and auth: what each call got and what it answers.
    bucket: '',
    storageCalls: [] as Call[],
    storageResult: { data: null as unknown, error: null as unknown },
    invokeCalls: [] as unknown[][],
    invokeResult: { data: null as unknown, error: null as unknown },
    session: null as { user: { id: string } } | null,
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
  const storageBucket = Object.fromEntries(
    ['upload', 'remove', 'createSignedUrl'].map((method) => [
      method,
      (...args: unknown[]) => {
        state.storageCalls.push({ method, args })
        return Promise.resolve(state.storageResult)
      },
    ]),
  )
  const supabase = {
    from: (table: string) => {
      state.table = table
      return builder()
    },
    storage: {
      from: (bucket: string) => {
        state.bucket = bucket
        return storageBucket
      },
    },
    functions: {
      invoke: (...args: unknown[]) => {
        state.invokeCalls.push(args)
        return Promise.resolve(state.invokeResult)
      },
    },
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: state.session }, error: null }),
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
  photo_path: null,
  archived_at: null,
}

beforeEach(() => {
  fake.state.table = ''
  fake.state.calls = []
  fake.state.result = { data: null, error: null }
  fake.state.bucket = ''
  fake.state.storageCalls = []
  fake.state.storageResult = { data: null, error: null }
  fake.state.invokeCalls = []
  fake.state.invokeResult = { data: null, error: null }
  fake.state.session = null
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

// Invented transcription (CLAUDE.md rule 5).
const transcription: Transcription = {
  is_nutrition_label: true,
  product_name: { status: 'legible', text: 'Alfajor de prueba' },
  brand: { status: 'illegible', text: null },
  carbohydrate_row_label: { status: 'legible', text: 'Carbohidratos' },
  columns: [
    {
      basis: 'per_portion',
      header_text: 'Porción',
      state: 'as_sold',
      state_text: null,
      portion_size_g: { status: 'legible', text: '50 g' },
      portion_description: { status: 'legible', text: '1 alfajor' },
      carbohydrates_g: { status: 'legible', text: '38' },
      energy: { status: 'legible', text: '190 kcal' },
    },
  ],
  observations: null,
}

describe('createFood, from a label', () => {
  it('sends source label, the photo and the original transcription', async () => {
    const values: FoodFormValues = {
      name: 'Alfajor de prueba',
      brand: null,
      state: 'as_eaten',
      carbs_per_100g: 76,
      cooking_factor: null,
      unit_weight_g: 50,
      unit_label: 'alfajor',
      notes: null,
    }
    const path = 'user-1/photo.jpg'
    fake.state.result = {
      data: { ...food, ...values, source: 'label', photo_path: path },
      error: null,
    }
    await createFood(toNewLabelFood(values, path, transcription))
    const row = fake.state.calls.find((c) => c.method === 'insert')
      ?.args[0] as Record<string, unknown>
    expect(row).toEqual({
      ...values,
      source: 'label',
      photo_path: path,
      label_transcription: transcription,
    })
    expect(row).not.toHaveProperty('user_id')
  })
})

describe('uploadLabelPhoto', () => {
  it('uploads a JPEG to {user_id}/{uuid}.jpg without overwriting', async () => {
    fake.state.session = { user: { id: 'user-1' } }
    const photo = new Blob(['x'], { type: 'image/jpeg' })
    const path = await uploadLabelPhoto(photo)

    expect(path).toMatch(
      /^user-1\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/,
    )
    expect(fake.state.bucket).toBe('food-photos')
    expect(fake.state.storageCalls).toEqual([
      {
        method: 'upload',
        args: [path, photo, { contentType: 'image/jpeg', upsert: false }],
      },
    ])
  })

  it('without a session throws UnauthorizedError and uploads nothing', async () => {
    await expect(uploadLabelPhoto(new Blob(['x']))).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
    expect(fake.state.storageCalls).toEqual([])
  })

  it('throws the Storage error', async () => {
    fake.state.session = { user: { id: 'user-1' } }
    const error = new Error('boom')
    fake.state.storageResult = { data: null, error }
    await expect(uploadLabelPhoto(new Blob(['x']))).rejects.toBe(error)
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

describe('transcribeLabel', () => {
  it('sends the path and returns the validated transcription', async () => {
    fake.state.invokeResult = {
      data: { ok: true, transcription },
      error: null,
    }
    await expect(transcribeLabel('user-1/photo.jpg')).resolves.toEqual(
      transcription,
    )
    expect(fake.state.invokeCalls).toEqual([
      [
        'transcribe-label',
        { body: { storage_path: 'user-1/photo.jpg' }, timeout: 60_000 },
      ],
    ])
  })

  it('a 200 with another shape throws', async () => {
    fake.state.invokeResult = {
      data: { ok: true, transcription: { is_nutrition_label: 'yes' } },
      error: null,
    }
    await expect(transcribeLabel('user-1/photo.jpg')).rejects.toThrow()
  })

  it.each([
    [429, 'VISION_QUOTA_EXCEEDED', true],
    [429, 'DAILY_CAP_REACHED', false],
    [503, 'VISION_UNAVAILABLE', true],
    [502, 'VISION_BAD_RESPONSE', true],
    [400, 'INVALID_REQUEST', false],
  ] as const)(
    '%i %s gives a VisionError (retryable %s)',
    async (status, code, retryable) => {
      fake.state.invokeResult = {
        data: null,
        error: httpError(status, errorBody(code, retryable)),
      }
      const error: unknown = await transcribeLabel('user-1/photo.jpg').catch(
        (e: unknown) => e,
      )
      expect(error).toBeInstanceOf(VisionError)
      expect(error).toMatchObject({ code, retryable })
    },
  )

  it('a 401 gives UnauthorizedError, whatever its body', async () => {
    for (const body of [
      errorBody('UNAUTHORIZED', false),
      JSON.stringify({ msg: 'Invalid JWT' }),
      'not json',
    ]) {
      fake.state.invokeResult = { data: null, error: httpError(401, body) }
      await expect(transcribeLabel('user-1/photo.jpg')).rejects.toBeInstanceOf(
        UnauthorizedError,
      )
    }
  })

  it.each([
    ['a body that is not JSON', 500, 'not json'],
    ['INTERNAL_ERROR', 500, errorBody('INTERNAL_ERROR', true)],
    ['an unknown code', 429, errorBody('SOMETHING', true)],
    ['a code without retryable', 429, errorBody('DAILY_CAP_REACHED')],
  ])('%s is thrown as it came', async (_label, status, body) => {
    const error = httpError(status, body)
    fake.state.invokeResult = { data: null, error }
    await expect(transcribeLabel('user-1/photo.jpg')).rejects.toBe(error)
  })

  it('a network error is thrown as it came', async () => {
    const error = new FunctionsFetchError(new TypeError('Failed to fetch'))
    fake.state.invokeResult = { data: null, error }
    await expect(transcribeLabel('user-1/photo.jpg')).rejects.toBe(error)
  })
})

describe('deleteLabelPhoto', () => {
  it('removes that path from food-photos', async () => {
    await deleteLabelPhoto('user-1/photo.jpg')
    expect(fake.state.bucket).toBe('food-photos')
    expect(fake.state.storageCalls).toEqual([
      { method: 'remove', args: [['user-1/photo.jpg']] },
    ])
  })

  it('throws the Storage error', async () => {
    const error = new Error('boom')
    fake.state.storageResult = { data: null, error }
    await expect(deleteLabelPhoto('user-1/photo.jpg')).rejects.toBe(error)
  })
})

describe('createLabelPhotoUrl', () => {
  it('asks for a URL signed for 10 minutes', async () => {
    fake.state.storageResult = {
      data: { signedUrl: 'https://example.test/signed' },
      error: null,
    }
    await expect(createLabelPhotoUrl('user-1/photo.jpg')).resolves.toBe(
      'https://example.test/signed',
    )
    expect(fake.state.storageCalls).toEqual([
      { method: 'createSignedUrl', args: ['user-1/photo.jpg', 600] },
    ])
  })
})
