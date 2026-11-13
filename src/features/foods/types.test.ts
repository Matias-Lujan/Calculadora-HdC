import { describe, expect, it } from 'vitest'
import { foodSchema, needsCookingFactor } from './types.ts'

const asEaten = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Galletitas de prueba',
  brand: 'Marca Inventada',
  source: 'label',
  state: 'as_eaten',
  carbs_per_100g: 68.4,
  cooking_factor: null,
  unit_weight_g: 9.5,
  unit_label: 'galletita',
  reference_db: null,
  reference_code: null,
  reference_description: null,
  notes: null,
  archived_at: null,
}

const rawCooked = {
  ...asEaten,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Fideos de prueba',
  state: 'raw_cooked',
  carbs_per_100g: 72,
  cooking_factor: 2.6,
  unit_weight_g: null,
  unit_label: null,
}

const reference = {
  ...asEaten,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Manzana',
  brand: null,
  source: 'reference',
  carbs_per_100g: 12.1,
  unit_weight_g: null,
  unit_label: null,
  reference_db: 'argenfoods',
  reference_code: 'X-001',
  reference_description: 'Manzana roja, cruda',
}

describe('foodSchema', () => {
  it('acepta un alimento tal como se come', () => {
    expect(foodSchema.parse(asEaten)).toEqual(asEaten)
  })

  it('acepta uno crudo que se come cocido, con y sin factor', () => {
    expect(foodSchema.parse(rawCooked)).toEqual(rawCooked)
    const noFactor = { ...rawCooked, cooking_factor: null }
    expect(foodSchema.parse(noFactor)).toEqual(noFactor)
  })

  it('acepta uno de tabla de referencia (argenfoods)', () => {
    expect(foodSchema.parse(reference)).toEqual(reference)
  })

  it('acepta uno archivado', () => {
    const archived = { ...asEaten, archived_at: '2026-11-13T12:00:00+00:00' }
    expect(foodSchema.parse(archived)).toEqual(archived)
  })

  it('descarta las columnas que no conoce (user_id, updated_at)', () => {
    expect(
      foodSchema.parse({
        ...asEaten,
        user_id: '00000000-0000-4000-8000-000000000009',
        updated_at: '2026-11-13T00:00:00Z',
      }),
    ).toEqual(asEaten)
  })

  it.each([
    ['source', 'x'],
    ['state', 'cooked'],
    ['reference_db', 'otra'],
  ])('rechaza %s = %j', (key, value) => {
    expect(foodSchema.safeParse({ ...asEaten, [key]: value }).success).toBe(
      false,
    )
  })

  it.each(['carbs_per_100g', 'cooking_factor', 'unit_weight_g'])(
    'rechaza %s como string',
    (key) => {
      expect(foodSchema.safeParse({ ...rawCooked, [key]: '78' }).success).toBe(
        false,
      )
    },
  )

  it.each([NaN, Infinity, -Infinity])(
    'rechaza %s en carbs_per_100g',
    (value) => {
      expect(
        foodSchema.safeParse({ ...asEaten, carbs_per_100g: value }).success,
      ).toBe(false)
    },
  )

  it('rechaza carbs_per_100g null', () => {
    expect(
      foodSchema.safeParse({ ...asEaten, carbs_per_100g: null }).success,
    ).toBe(false)
  })

  it.each(['name', 'state', 'source', 'id', 'carbs_per_100g'])(
    'rechaza una fila sin %s',
    (key) => {
      const value: Record<string, unknown> = { ...asEaten }
      delete value[key]
      expect(foodSchema.safeParse(value).success).toBe(false)
    },
  )

  it('rechaza cooking_factor ausente (tiene que venir, aunque sea null)', () => {
    expect(
      foodSchema.safeParse({ ...rawCooked, cooking_factor: undefined }).success,
    ).toBe(false)
  })

  it.each([null, undefined, 'x', 42, []])(
    'rechaza el no-objeto %j',
    (value) => {
      expect(foodSchema.safeParse(value).success).toBe(false)
    },
  )

  it('conserva los valores sin redondear', () => {
    const value = { ...rawCooked, carbs_per_100g: 0.1 + 0.2 }
    expect(foodSchema.parse(value).carbs_per_100g).toBe(0.1 + 0.2)
  })
})

describe('needsCookingFactor', () => {
  it('crudo que se come cocido sin factor → true', () => {
    expect(
      needsCookingFactor({ state: 'raw_cooked', cooking_factor: null }),
    ).toBe(true)
  })

  it('crudo que se come cocido con factor → false', () => {
    expect(
      needsCookingFactor({ state: 'raw_cooked', cooking_factor: 2.6 }),
    ).toBe(false)
  })

  it('tal como se come, sin factor → false', () => {
    expect(
      needsCookingFactor({ state: 'as_eaten', cooking_factor: null }),
    ).toBe(false)
  })
})

describe('foodSchema: bordes', () => {
  it.each(['label', 'reference', 'manual'])('acepta source = %j', (source) => {
    expect(foodSchema.safeParse({ ...asEaten, source }).success).toBe(true)
  })

  it.each(['as_eaten', 'raw_cooked'])('acepta state = %j', (state) => {
    expect(foodSchema.safeParse({ ...asEaten, state }).success).toBe(true)
  })

  it.each(['usda_fdc', 'argenfoods'])('acepta reference_db = %j', (db) => {
    expect(
      foodSchema.safeParse({ ...reference, reference_db: db }).success,
    ).toBe(true)
  })

  it.each([
    ['source', 'Label'],
    ['state', 'AS_EATEN'],
    ['reference_db', 'ARGENFOODS'],
    ['source', null],
    ['state', null],
  ])('rechaza %s = %j', (key, value) => {
    expect(foodSchema.safeParse({ ...asEaten, [key]: value }).success).toBe(
      false,
    )
  })

  it.each(['name', 'id'])('rechaza %s null', (key) => {
    expect(foodSchema.safeParse({ ...asEaten, [key]: null }).success).toBe(
      false,
    )
  })

  it('rechaza un id numérico', () => {
    expect(foodSchema.safeParse({ ...asEaten, id: 1 }).success).toBe(false)
  })

  it.each([
    'brand',
    'unit_weight_g',
    'unit_label',
    'reference_db',
    'archived_at',
  ])('rechaza una fila sin %s (nullable, no opcional)', (key) => {
    const value: Record<string, unknown> = { ...asEaten }
    delete value[key]
    expect(foodSchema.safeParse(value).success).toBe(false)
  })
})

describe('needsCookingFactor: bordes', () => {
  it('tal como se come con factor (no debería existir) → false', () => {
    expect(needsCookingFactor({ state: 'as_eaten', cooking_factor: 2 })).toBe(
      false,
    )
  })

  it('un factor 0 no cuenta como faltante', () => {
    expect(needsCookingFactor({ state: 'raw_cooked', cooking_factor: 0 })).toBe(
      false,
    )
  })

  it('funciona con las filas validadas', () => {
    expect(needsCookingFactor(foodSchema.parse(rawCooked))).toBe(false)
    expect(
      needsCookingFactor(
        foodSchema.parse({ ...rawCooked, cooking_factor: null }),
      ),
    ).toBe(true)
    expect(needsCookingFactor(foodSchema.parse(asEaten))).toBe(false)
  })
})
