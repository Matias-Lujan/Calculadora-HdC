import { describe, expect, it, vi } from 'vitest'
import type { Food } from '../../lib/foods.ts'
import {
  copiedMeal,
  copyMealItems,
  mealCopyRequest,
  mealCopyState,
  type MealCopyRequest,
} from './mealCopy.ts'
import type { CopyableMealItem } from './types.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))

// Invented data, not real foods.

const banana: Food = {
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
  notes: null,
  photo_path: null,
  archived_at: null,
}

const alfajor: Food = {
  ...banana,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Alfajor de prueba',
  carbs_per_100g: 58,
  unit_weight_g: 45,
  unit_label: 'alfajor',
}

const rice: Food = {
  ...banana,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Arroz de prueba',
  state: 'raw_cooked',
  carbs_per_100g: 78,
  cooking_factor: 2.6,
}

const inGrams = (
  position: number,
  food: Food,
  grams: number,
): CopyableMealItem => ({
  position,
  food_id: food.id,
  food_name: food.name,
  quantity_mode: 'grams',
  units: null,
  grams,
})

const inUnits = (
  position: number,
  food: Food,
  units: number,
): CopyableMealItem => ({
  position,
  food_id: food.id,
  food_name: food.name,
  quantity_mode: 'units',
  units,
  grams: units * (food.unit_weight_g ?? 1),
})

describe('copyMealItems', () => {
  it('copies each item with today’s food and its quantity as entered, in order, with keys from 0', () => {
    const today = { ...rice, carbs_per_100g: 80, cooking_factor: 3 }
    const copy = copyMealItems(
      [
        inUnits(2, alfajor, 0.5),
        inGrams(0, rice, 250),
        inGrams(1, banana, 120),
      ],
      [banana, alfajor, today],
    )
    expect(copy.skipped).toEqual([])
    expect(copy.items).toEqual([
      { key: 0, food: today, quantityMode: 'grams', quantityText: '250' },
      { key: 1, food: banana, quantityMode: 'grams', quantityText: '120' },
      { key: 2, food: alfajor, quantityMode: 'units', quantityText: '0,5' },
    ])
  })

  it('the quantity exact, as the field writes it', () => {
    const copy = copyMealItems(
      [inGrams(0, banana, 1250.5), inGrams(1, banana, 0.1 + 0.2)],
      [banana],
    )
    expect(copy.items.map((item) => item.quantityText)).toEqual([
      '1.250,5',
      '0,30000000000000004',
    ])
  })

  it('an item in grams of a food that has a weight per unit today stays in grams', () => {
    const copy = copyMealItems([inGrams(0, alfajor, 30)], [alfajor])
    expect(copy.items[0]?.quantityMode).toBe('grams')
  })

  it('the same food twice is copied twice', () => {
    const copy = copyMealItems(
      [inGrams(0, banana, 100), inGrams(1, banana, 50)],
      [banana],
    )
    expect(copy.items).toHaveLength(2)
  })

  it('does not copy a food that is not in the catalog (archived or gone)', () => {
    const copy = copyMealItems(
      [inGrams(0, banana, 100), inGrams(1, rice, 200)],
      [rice],
    )
    expect(copy.items.map((item) => item.food)).toEqual([rice])
    expect(copy.items[0]?.key).toBe(0)
    expect(copy.skipped).toEqual([
      { foodName: banana.name, reason: 'NOT_IN_CATALOG' },
    ])
  })

  it('does not copy a cooked food without how much it yields today', () => {
    const noYield = { ...rice, cooking_factor: null }
    const copy = copyMealItems([inGrams(0, rice, 200)], [noYield])
    expect(copy.items).toEqual([])
    expect(copy.skipped).toEqual([
      { foodName: rice.name, reason: 'MISSING_COOKING_FACTOR' },
    ])
  })

  it('does not copy an item in units if the food has no weight per unit today', () => {
    const noUnit = { ...alfajor, unit_weight_g: null }
    const copy = copyMealItems([inUnits(0, alfajor, 1)], [noUnit])
    expect(copy.items).toEqual([])
    expect(copy.skipped).toEqual([
      { foodName: alfajor.name, reason: 'NO_UNIT_WEIGHT' },
    ])
  })

  it('nor if the food is cooked now (always in grams)', () => {
    const cooked = {
      ...alfajor,
      state: 'raw_cooked' as const,
      cooking_factor: 2,
    }
    const copy = copyMealItems([inUnits(0, alfajor, 1)], [cooked])
    expect(copy.skipped).toEqual([
      { foodName: alfajor.name, reason: 'NO_UNIT_WEIGHT' },
    ])
  })

  it('uses the saved name in the notice, not today’s', () => {
    const renamed = { ...rice, name: 'Arroz nuevo', cooking_factor: null }
    const copy = copyMealItems([inGrams(0, rice, 200)], [renamed])
    expect(copy.skipped[0]?.foodName).toBe('Arroz de prueba')
  })

  it('reports every item not copied, in order', () => {
    const copy = copyMealItems(
      [inGrams(1, rice, 200), inGrams(0, banana, 100), inUnits(2, alfajor, 1)],
      [
        { ...rice, cooking_factor: null },
        { ...alfajor, unit_weight_g: null },
      ],
    )
    expect(copy.items).toEqual([])
    expect(copy.skipped.map((item) => item.reason)).toEqual([
      'NOT_IN_CATALOG',
      'MISSING_COOKING_FACTOR',
      'NO_UNIT_WEIGHT',
    ])
  })
})

const request: MealCopyRequest = {
  mode: 'repeat',
  mealId: '00000000-0000-4000-8000-0000000000aa',
  eatenAt: '2026-11-15T11:30:00.123+00:00',
  appliedDoseUnits: 6.5,
  items: [inGrams(0, banana, 120)],
}

describe('copiedMeal', () => {
  it('repeating: the date in "Ahora" and the dose following the calculated one', () => {
    expect(copiedMeal(request, [banana])).toEqual({
      items: [
        { key: 0, food: banana, quantityMode: 'grams', quantityText: '120' },
      ],
      skipped: [],
      appliedDoseText: null,
      eatenAtText: null,
      correcting: null,
    })
  })

  it('correcting: its date and time (Buenos Aires) and its applied dose without trailing zeros, with the exact values and the items not brought', () => {
    const copy = copiedMeal(
      {
        ...request,
        mode: 'correct',
        appliedDoseUnits: 128.24 / 15,
        items: [inGrams(0, banana, 120), inGrams(1, rice, 200)],
      },
      [banana],
    )
    expect(copy.eatenAtText).toBe('2026-11-15T08:30')
    expect(copy.appliedDoseText).toBe('8,55')
    expect(copy.correcting).toEqual({
      mealId: request.mealId,
      eatenAt: request.eatenAt,
      eatenAtText: '2026-11-15T08:30',
      // Saved as is while the field keeps "8,55".
      appliedDose: { text: '8,55', value: 128.24 / 15 },
      skipped: [{ foodName: rice.name, reason: 'NOT_IN_CATALOG' }],
    })
  })

  it('correcting a meal without applied dose: the field empty', () => {
    const copy = copiedMeal(
      { ...request, mode: 'correct', appliedDoseUnits: null },
      [banana],
    )
    expect(copy.appliedDoseText).toBe('')
    expect(copy.correcting?.appliedDose).toBeNull()
  })

  it('correcting with 0 applied', () => {
    const copy = copiedMeal(
      { ...request, mode: 'correct', appliedDoseUnits: 0 },
      [banana],
    )
    expect(copy.appliedDoseText).toBe('0')
  })
})

describe('mealCopyRequest', () => {
  /** The navigation state survives a reload: as JSON. */
  const roundTrip = (value: unknown) =>
    JSON.parse(JSON.stringify(value)) as unknown

  it('reads back the state the detail sends', () => {
    expect(mealCopyRequest(roundTrip(mealCopyState(request)))).toEqual(request)
  })

  it('drops the columns it does not use', () => {
    const state = mealCopyState({
      ...request,
      items: [{ ...inGrams(0, banana, 120), carbs_g: 24.24 } as never],
    })
    expect(mealCopyRequest(roundTrip(state))?.items).toEqual([
      inGrams(0, banana, 120),
    ])
  })

  it.each([
    null,
    undefined,
    {},
    { fromMeal: true },
    { copyMeal: { ...request, mode: 'edit' } },
    { copyMeal: { ...request, mealId: 'abc' } },
    { copyMeal: { ...request, eatenAt: '2026-11-15' } },
    { copyMeal: { ...request, appliedDoseUnits: -1 } },
    { copyMeal: { ...request, items: [] } },
    { copyMeal: { ...request, items: [{ position: 0 }] } },
  ])('rejects %j', (state) => {
    expect(mealCopyRequest(state)).toBeNull()
  })
})
