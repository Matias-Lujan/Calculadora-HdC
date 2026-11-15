import { describe, expect, it } from 'vitest'
import { calculateMeal } from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'
import type { Settings } from '../../lib/settings.ts'
import {
  toDoseSettings,
  toMealItemInput,
  toNewMealRecord,
} from './mealDraft.ts'
import {
  mealSummarySchema,
  referenceFoodSchema,
  savedMealItemSchema,
  savedMealSchema,
  type MealItemDraft,
} from './types.ts'

// Invented data, as PostgREST would return it (the values of spec §8.3).

const summaryRow = {
  id: '00000000-0000-4000-8000-0000000000aa',
  eaten_at: '2026-11-14T16:05:00.123+00:00',
  total_carbs_g: 128.24,
  calculated_dose_units: 8.549333333333333,
  applied_dose_units: 8.5,
}

const itemRow = {
  position: 0,
  food_name: 'Arroz de prueba',
  food_brand: null,
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

const unitsRow = {
  ...itemRow,
  position: 1,
  food_name: 'Alfajor de prueba',
  food_brand: 'Marca Inventada',
  food_state: 'as_eaten',
  quantity_mode: 'units',
  units: 1,
  unit_weight_g: 50,
  grams: 50,
  carbs_per_100g: 58,
  cooking_factor: null,
  effective_carbs_per_100g: 58,
  carbs_g: 29,
}

const mealRow = {
  ...summaryRow,
  carb_ratio_g_per_unit: 15,
  meal_items: [itemRow, unitsRow],
}

describe('mealSummarySchema', () => {
  it('accepts a valid row', () => {
    expect(mealSummarySchema.parse(summaryRow)).toEqual(summaryRow)
  })

  it('accepts a row without an applied dose', () => {
    const row = { ...summaryRow, applied_dose_units: null }
    expect(mealSummarySchema.parse(row)).toEqual(row)
  })

  it('drops the meal_items used to filter, and unknown columns', () => {
    const parsed = mealSummarySchema.parse({
      ...summaryRow,
      meal_items: [{ id: 'x' }],
      calc_version: '2',
      other: 1,
    })
    expect(parsed).toEqual(summaryRow)
    expect(Object.keys(parsed)).not.toContain('meal_items')
  })

  it.each([
    '2026-11-14T16:05:00+00:00',
    '2026-11-14T16:05:00.123456+00:00',
    '2026-11-14T16:05:00Z',
    '2026-11-14T13:05:00-03:00',
  ])('accepts eaten_at %s', (eatenAt) => {
    expect(
      mealSummarySchema.safeParse({ ...summaryRow, eaten_at: eatenAt }),
    ).toMatchObject({ success: true })
  })

  it.each([
    // Without an offset.
    '2026-11-14T16:05:00',
    // A space instead of "T".
    '2026-11-14 16:05:00+00:00',
    // Without seconds.
    '2026-11-14T16:05+00:00',
    '2026-11-14',
    '',
    'abc',
  ])('rejects eaten_at %j', (eatenAt) => {
    expect(
      mealSummarySchema.safeParse({ ...summaryRow, eaten_at: eatenAt }).success,
    ).toBe(false)
  })

  it.each([
    ['total_carbs_g', '128.24'],
    ['total_carbs_g', Number.NaN],
    ['total_carbs_g', Number.POSITIVE_INFINITY],
    ['calculated_dose_units', '8.5'],
    ['calculated_dose_units', Number.NEGATIVE_INFINITY],
    ['applied_dose_units', '8.5'],
    ['applied_dose_units', Number.NaN],
    ['id', 1],
  ])('rejects %s = %j', (column, value) => {
    expect(
      mealSummarySchema.safeParse({ ...summaryRow, [column]: value }).success,
    ).toBe(false)
  })

  it('rejects a row without the applied dose column (null is not missing)', () => {
    const row: Record<string, unknown> = { ...summaryRow }
    delete row.applied_dose_units
    expect(mealSummarySchema.safeParse(row).success).toBe(false)
  })
})

describe('savedMealItemSchema', () => {
  it('accepts items in grams and in units', () => {
    expect(savedMealItemSchema.parse(itemRow)).toEqual(itemRow)
    expect(savedMealItemSchema.parse(unitsRow)).toEqual(unitsRow)
  })

  it.each([
    ['food_state', 'cooked'],
    ['food_state', null],
    ['quantity_mode', 'kilos'],
    ['quantity_mode', null],
    ['grams', '250'],
    ['grams', Number.NaN],
    ['carbs_g', Number.POSITIVE_INFINITY],
    ['effective_carbs_per_100g', null],
    ['position', '0'],
  ])('rejects %s = %j', (column, value) => {
    expect(
      savedMealItemSchema.safeParse({ ...itemRow, [column]: value }).success,
    ).toBe(false)
  })

  it.each(['food_brand', 'units', 'unit_weight_g', 'cooking_factor'])(
    'rejects an item without the nullable column %s',
    (column) => {
      const row: Record<string, unknown> = { ...itemRow }
      delete row[column]
      expect(savedMealItemSchema.safeParse(row).success).toBe(false)
    },
  )
})

describe('the schemas at the edges of the CHECKs (migration of meals)', () => {
  it.each([
    ['total_carbs_g', 0],
    ['calculated_dose_units', 0],
    ['applied_dose_units', 0],
    ['total_carbs_g', 1e12],
    ['calculated_dose_units', 1e-9],
  ])('the summary accepts %s = %s', (column, value) => {
    const row = { ...summaryRow, [column]: value }
    expect(mealSummarySchema.parse(row)).toEqual(row)
  })

  it.each([
    ['carb_ratio_g_per_unit', 0.001],
    ['carb_ratio_g_per_unit', 1e-9],
    ['carb_ratio_g_per_unit', 1000],
  ])('the meal accepts %s = %s', (column, value) => {
    const row = { ...mealRow, [column]: value }
    expect(savedMealSchema.parse(row)).toEqual(row)
  })

  it.each([
    { position: 0 },
    { position: 2_147_483_647 },
    // carbs_per_100g and effective between 0 and 100, both ends.
    { carbs_per_100g: 0, effective_carbs_per_100g: 0, carbs_g: 0 },
    { carbs_per_100g: 100, cooking_factor: 1, effective_carbs_per_100g: 100 },
    // grams > 0 and cooking_factor > 0, very small.
    { grams: 1e-9, carbs_g: 3e-10 },
    { cooking_factor: 1e-9 },
    { grams: 1e12, carbs_g: 3e11 },
  ])('an item in grams accepts %o', (overrides) => {
    const row = { ...itemRow, ...overrides }
    expect(savedMealItemSchema.parse(row)).toEqual(row)
  })

  it.each([
    { units: 1e-9, unit_weight_g: 50, grams: 5e-8 },
    { units: 2, unit_weight_g: 1e-9, grams: 2e-9 },
    { units: 0.5, unit_weight_g: 45, grams: 22.5, carbs_g: 13.05 },
  ])('an item in units accepts %o', (overrides) => {
    const row = { ...unitsRow, ...overrides }
    expect(savedMealItemSchema.parse(row)).toEqual(row)
  })

  it('a meal with one item is enough', () => {
    const row = { ...mealRow, meal_items: [itemRow] }
    expect(savedMealSchema.parse(row).meal_items).toHaveLength(1)
  })
})

describe('the schemas read the JSON that PostgREST sends', () => {
  // numeric arrives as a JSON number (Postgres writes it without quotes,
  // with every digit it has) and timestamptz as ISO with "+00:00".
  const body = `{
    "id": "00000000-0000-4000-8000-0000000000aa",
    "eaten_at": "2026-11-14T16:05:00.123+00:00",
    "carb_ratio_g_per_unit": 15,
    "total_carbs_g": 128.24,
    "calculated_dose_units": 8.549333333333333333333333333333,
    "applied_dose_units": 8.50,
    "meal_items": [{
      "position": 0,
      "food_name": "Arroz de prueba",
      "food_brand": null,
      "food_state": "raw_cooked",
      "quantity_mode": "grams",
      "units": null,
      "unit_weight_g": null,
      "grams": 250,
      "carbs_per_100g": 78.0,
      "cooking_factor": 2.6,
      "effective_carbs_per_100g": 30.000000000000000000,
      "carbs_g": 75
    }]
  }`

  it('the detail', () => {
    const parsed = savedMealSchema.parse(JSON.parse(body) as unknown)
    expect(parsed.calculated_dose_units).toBe(128.24 / 15)
    expect(parsed.applied_dose_units).toBe(8.5)
    expect(parsed.meal_items[0]?.effective_carbs_per_100g).toBe(30)
  })

  it('a row of the list, with its filtering embed', () => {
    const row = JSON.parse(body) as Record<string, unknown>
    row.meal_items = [{ id: '00000000-0000-4000-8000-0000000000ee' }]
    expect(mealSummarySchema.parse(row)).toEqual({
      id: '00000000-0000-4000-8000-0000000000aa',
      eaten_at: '2026-11-14T16:05:00.123+00:00',
      total_carbs_g: 128.24,
      calculated_dose_units: 128.24 / 15,
      applied_dose_units: 8.5,
    })
  })
})

describe('savedMealSchema', () => {
  it('accepts a meal with its items', () => {
    expect(savedMealSchema.parse(mealRow)).toEqual(mealRow)
  })

  it('rejects a meal without items', () => {
    expect(
      savedMealSchema.safeParse({ ...mealRow, meal_items: [] }).success,
    ).toBe(false)
  })

  it('rejects a meal without the items column', () => {
    const row: Record<string, unknown> = { ...mealRow }
    delete row.meal_items
    expect(savedMealSchema.safeParse(row).success).toBe(false)
  })

  it('rejects a meal with an invalid item', () => {
    expect(
      savedMealSchema.safeParse({
        ...mealRow,
        meal_items: [itemRow, { ...unitsRow, quantity_mode: 'kilos' }],
      }).success,
    ).toBe(false)
  })

  it.each([
    ['carb_ratio_g_per_unit', '15'],
    ['carb_ratio_g_per_unit', Number.NaN],
    ['carb_ratio_g_per_unit', null],
  ])('rejects %s = %j', (column, value) => {
    expect(
      savedMealSchema.safeParse({ ...mealRow, [column]: value }).success,
    ).toBe(false)
  })

  it('accepts what toNewMealRecord saves, read back as JSON', () => {
    const base: Food = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Banana de prueba',
      brand: null,
      source: 'manual',
      state: 'as_eaten',
      carbs_per_100g: 20.2,
      cooking_factor: null,
      unit_weight_g: null,
      unit_label: null,
      reference_db: null,
      reference_code: null,
      reference_description: null,
      notes: 'Inventado',
      photo_path: null,
      archived_at: null,
    }
    const rice: Food = {
      ...base,
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Arroz de prueba',
      state: 'raw_cooked',
      carbs_per_100g: 78,
      cooking_factor: 2.6,
    }
    const alfajor: Food = {
      ...base,
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Alfajor de prueba',
      brand: 'Marca Inventada',
      carbs_per_100g: 58,
      unit_weight_g: 50,
    }
    const settings: Settings = {
      user_id: '00000000-0000-4000-8000-0000000000ff',
      carb_ratio_g_per_unit: 15,
      max_dose_warning_units: null,
      max_item_grams_warning: 500,
    }
    const drafts: MealItemDraft[] = [
      { key: 0, food: rice, quantityMode: 'grams', quantityText: '250' },
      { key: 1, food: base, quantityMode: 'grams', quantityText: '120' },
      { key: 2, food: alfajor, quantityMode: 'units', quantityText: '1' },
    ]
    const result = calculateMeal(
      drafts.map(toMealItemInput),
      toDoseSettings(settings),
    )
    if (!result.ok) throw new Error('invalid test meal')
    const record = toNewMealRecord(
      drafts,
      result,
      settings,
      8.5,
      '2026-11-14T16:05:00.000Z',
    )
    // What the base returns: the meal with an id and its items embedded.
    const row = JSON.parse(
      JSON.stringify({
        id: '00000000-0000-4000-8000-0000000000aa',
        ...record.meal,
        meal_items: record.items,
      }),
    ) as unknown
    const parsed = savedMealSchema.parse(row)
    expect(parsed.meal_items).toHaveLength(3)
    expect(parsed.total_carbs_g).toBe(result.totalCarbsG)
    expect(parsed.calculated_dose_units).toBe(result.doseUnits)
    expect(parsed.applied_dose_units).toBe(8.5)
    expect(parsed.meal_items.map((item) => item.carbs_g)).toEqual(
      result.items.map((item) => item.carbsG),
    )
  })
})

describe('referenceFoodSchema', () => {
  // Invented code and values, as PostgREST would return them.
  const refRow = {
    reference_db: 'usda_fdc',
    reference_code: '900001',
    description_original: 'Invented banana, raw',
    name_es: 'Banana',
    state: 'as_eaten',
    carbs_per_100g: 20.229999999999997,
  }

  it('accepts a USDA row, with its values exact', () => {
    expect(referenceFoodSchema.parse(refRow)).toEqual(refRow)
  })

  it('accepts 0 g of HC', () => {
    expect(
      referenceFoodSchema.safeParse({ ...refRow, carbs_per_100g: 0 }).success,
    ).toBe(true)
  })

  it('drops unknown columns', () => {
    expect(referenceFoodSchema.parse({ ...refRow, id: 'x' })).toEqual(refRow)
  })

  it.each([
    ['an ARGENFOODS row', { reference_db: 'argenfoods' }],
    ['a raw_cooked row (it has no cooking factor)', { state: 'raw_cooked' }],
    ['an unknown state', { state: 'frozen' }],
    ['HC as text', { carbs_per_100g: '20.2' }],
    ['HC null', { carbs_per_100g: null }],
    ['HC NaN', { carbs_per_100g: Number.NaN }],
    ['no code', { reference_code: undefined }],
    ['no name', { name_es: null }],
  ])('rejects %s', (_, change) => {
    expect(
      referenceFoodSchema.safeParse({ ...refRow, ...change }).success,
    ).toBe(false)
  })
})
