import { describe, expect, it, vi } from 'vitest'
import type { Food } from '../../lib/foods.ts'
import type { MealCopyRequest } from './mealCopy.ts'
import {
  copiedMealForm,
  initialMealForm,
  nextItemKey,
  parseStoredMealDraft,
  type StoredMealDraft,
} from './storedDraft.ts'
import { tableFoodAsMealFood } from './tableFoods.ts'

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
  brand: 'Marca Inventada',
  source: 'label',
  carbs_per_100g: 58,
  unit_weight_g: 45,
  unit_label: 'alfajor',
  photo_path: 'user/photo.jpg',
}

const rice: Food = {
  ...banana,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Arroz de prueba',
  state: 'raw_cooked',
  carbs_per_100g: 78,
  cooking_factor: 2.6,
}

const tableApple = tableFoodAsMealFood({
  reference_db: 'usda_fdc',
  reference_code: '99999',
  description_original: 'Apple, invented',
  name_es: 'Manzana de prueba',
  state: 'as_eaten',
  carbs_per_100g: 11.4,
})

const draft: StoredMealDraft = {
  items: [
    { key: 0, food: alfajor, quantityMode: 'units', quantityText: '0,5' },
    { key: 3, food: rice, quantityMode: 'grams', quantityText: '250' },
    { key: 4, food: tableApple, quantityMode: 'grams', quantityText: '1,' },
  ],
  appliedDoseText: '8',
  eatenAtText: '2026-11-16T13:30',
  correcting: null,
}

/** What sessionStorage gives back: the draft as JSON, parsed. */
function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

describe('parseStoredMealDraft', () => {
  it('reads back a stored draft as it was', () => {
    expect(parseStoredMealDraft(roundTrip(draft))).toEqual(draft)
  })

  it('keeps the applied dose following the calculated one and "Ahora"', () => {
    const following = { ...draft, appliedDoseText: null, eatenAtText: null }
    expect(parseStoredMealDraft(roundTrip(following))).toEqual(following)
  })

  it('keeps the quantity as typed, even empty or incomplete', () => {
    const typed = {
      ...draft,
      items: [{ ...draft.items[1], quantityText: '' }],
    }
    expect(parseStoredMealDraft(roundTrip(typed))).toEqual(typed)
  })

  it('gives null without a draft or with something that is not one', () => {
    expect(parseStoredMealDraft(null)).toBeNull()
    expect(parseStoredMealDraft('meal')).toBeNull()
    expect(parseStoredMealDraft({})).toBeNull()
    expect(parseStoredMealDraft([])).toBeNull()
  })

  it('gives null without items', () => {
    expect(parseStoredMealDraft({ ...draft, items: [] })).toBeNull()
  })

  it('gives null if a field is missing or of another type', () => {
    const [first] = draft.items
    const withItem = (item: unknown) => ({ ...draft, items: [item] })
    expect(parseStoredMealDraft({ items: draft.items })).toBeNull()
    expect(parseStoredMealDraft({ ...draft, appliedDoseText: 8 })).toBeNull()
    expect(parseStoredMealDraft(withItem({ ...first, key: '0' }))).toBeNull()
    expect(parseStoredMealDraft(withItem({ ...first, key: -1 }))).toBeNull()
    expect(parseStoredMealDraft(withItem({ ...first, key: 0.5 }))).toBeNull()
    expect(
      parseStoredMealDraft(withItem({ ...first, quantityText: 0.5 })),
    ).toBeNull()
    expect(
      parseStoredMealDraft(withItem({ ...first, quantityMode: 'cups' })),
    ).toBeNull()
    expect(
      parseStoredMealDraft(
        withItem({ ...first, food: { ...alfajor, carbs_per_100g: '58' } }),
      ),
    ).toBeNull()
    expect(
      parseStoredMealDraft(
        withItem({ ...first, food: { ...alfajor, state: 'cooked' } }),
      ),
    ).toBeNull()
  })

  it('gives null if two items share a key', () => {
    const [first, second] = draft.items
    expect(
      parseStoredMealDraft({
        ...draft,
        items: [first, { ...second, key: first?.key }],
      }),
    ).toBeNull()
  })

  it('gives null for units where the form does not offer them', () => {
    const units = { quantityMode: 'units', quantityText: '1' }
    expect(
      parseStoredMealDraft({
        ...draft,
        items: [{ key: 0, food: banana, ...units }],
      }),
    ).toBeNull()
    expect(
      parseStoredMealDraft({
        ...draft,
        items: [
          { key: 0, food: { ...alfajor, state: 'raw_cooked' }, ...units },
        ],
      }),
    ).toBeNull()
  })

  it('gives null for a food without id that is not from the table', () => {
    const item = { key: 0, quantityMode: 'grams', quantityText: '100' }
    const notCopied = (food: unknown) =>
      parseStoredMealDraft({ ...draft, items: [{ ...item, food }] })
    expect(notCopied({ ...banana, id: null })).toBeNull()
    expect(notCopied({ ...tableApple, reference_code: null })).toBeNull()
    expect(notCopied({ ...tableApple, reference_db: 'argenfoods' })).toBeNull()
    expect(notCopied({ ...tableApple, state: 'raw_cooked' })).toBeNull()
    expect(notCopied(tableApple)).not.toBeNull()
  })
})

describe('nextItemKey', () => {
  it('is one more than the biggest key, or 0 without items', () => {
    expect(nextItemKey([])).toBe(0)
    expect(nextItemKey(draft.items)).toBe(5)
  })
})

describe('initialMealForm', () => {
  it('starts empty without a draft', () => {
    expect(initialMealForm(null, null)).toEqual({
      items: [],
      appliedDoseText: null,
      eatenAtText: null,
      correcting: null,
      nextKey: 0,
      focusKey: null,
      notUsableFood: null,
      copyNotice: null,
    })
  })

  it('restores the stored draft as it was', () => {
    expect(initialMealForm(draft, null)).toEqual({
      ...draft,
      nextKey: 5,
      focusKey: null,
      notUsableFood: null,
      copyNotice: null,
    })
  })

  it('adds the food from the photo at the end, with the focus on it', () => {
    const form = initialMealForm(draft, alfajor)
    expect(form.items.slice(0, 3)).toEqual(draft.items)
    expect(form.items[3]).toEqual({
      key: 5,
      food: alfajor,
      quantityMode: 'units',
      quantityText: '',
    })
    expect(form.focusKey).toBe(5)
    expect(form.nextKey).toBe(6)
    expect(form.appliedDoseText).toBe('8')
    expect(form.eatenAtText).toBe('2026-11-16T13:30')
    expect(form.notUsableFood).toBeNull()
  })

  it('adds the food from the photo to an empty meal', () => {
    const form = initialMealForm(null, banana)
    expect(form.items).toEqual([
      { key: 0, food: banana, quantityMode: 'grams', quantityText: '' },
    ])
    expect(form.focusKey).toBe(0)
    expect(form.nextKey).toBe(1)
  })

  it('adds a food already in the meal as a second item', () => {
    const form = initialMealForm(draft, rice)
    expect(form.items.filter((item) => item.food.id === rice.id)).toHaveLength(
      2,
    )
  })

  it('does not add a cooked food without how much it yields', () => {
    const noFactor = { ...rice, cooking_factor: null }
    expect(initialMealForm(draft, noFactor)).toEqual({
      ...draft,
      nextKey: 5,
      focusKey: null,
      notUsableFood: { id: rice.id, name: rice.name },
      copyNotice: null,
    })
  })
})

// The meal being corrected (spec §6.7, "Corregir"), kept with the meal.
describe('parseStoredMealDraft: the correction', () => {
  const correcting = {
    mealId: '00000000-0000-4000-8000-0000000000aa',
    eatenAt: '2026-11-15T00:00:00.123+00:00',
    eatenAtText: '2026-11-14T21:00',
    appliedDose: { text: '8,55', value: 8.546666666666667 },
    skipped: [{ foodName: 'Archivado de prueba', reason: 'NOT_IN_CATALOG' }],
  }

  it('reads it back as it was, also without dose or items not brought', () => {
    const plain = {
      ...draft,
      correcting: { ...correcting, appliedDose: null, skipped: [] },
    }
    expect(parseStoredMealDraft(roundTrip(plain))).toEqual(plain)
    const correction = { ...draft, correcting }
    expect(parseStoredMealDraft(roundTrip(correction))).toEqual(correction)
  })

  it('a meal kept without it (before corrections existed) is not one', () => {
    const old: Record<string, unknown> = { ...draft }
    delete old.correcting
    expect(parseStoredMealDraft(roundTrip(old))).toEqual(draft)
  })

  it.each([
    { ...correcting, mealId: 'abc' },
    { ...correcting, mealId: null },
    { ...correcting, eatenAt: '2026-11-15' },
    { ...correcting, eatenAt: 1 },
    { mealId: correcting.mealId },
    { ...correcting, eatenAtText: null },
    { ...correcting, appliedDose: { text: '8,55' } },
    { ...correcting, appliedDose: { text: '8,55', value: -1 } },
    { ...correcting, skipped: [{ foodName: 'X', reason: 'GONE' }] },
    { ...correcting, skipped: undefined },
    'aa',
  ])('gives null for a correction that is not valid: %j', (value) => {
    expect(parseStoredMealDraft({ ...draft, correcting: value })).toBeNull()
  })
})

describe('copiedMealForm', () => {
  const request: MealCopyRequest = {
    mode: 'repeat',
    mealId: '00000000-0000-4000-8000-0000000000aa',
    eatenAt: '2026-11-15T11:30:00+00:00',
    appliedDoseUnits: 7,
    items: [
      {
        position: 0,
        food_id: rice.id,
        food_name: rice.name,
        quantity_mode: 'grams',
        units: null,
        grams: 250,
      },
      {
        position: 1,
        food_id: '00000000-0000-4000-8000-0000000000ff',
        food_name: 'Archivado de prueba',
        quantity_mode: 'grams',
        units: null,
        grams: 30,
      },
    ],
  }

  it('repeating replaces the meal in progress, with the notice of when it was eaten', () => {
    expect(copiedMealForm(draft, request, [rice, banana])).toEqual({
      items: [
        { key: 0, food: rice, quantityMode: 'grams', quantityText: '250' },
      ],
      appliedDoseText: null,
      eatenAtText: null,
      correcting: null,
      nextKey: 1,
      focusKey: null,
      notUsableFood: null,
      copyNotice: {
        repeatedFrom: request.eatenAt,
        skipped: [
          { foodName: 'Archivado de prueba', reason: 'NOT_IN_CATALOG' },
        ],
      },
    })
  })

  it('correcting keeps which meal it replaces, without "Copiaste…"', () => {
    const form = copiedMealForm(null, { ...request, mode: 'correct' }, [rice])
    expect(form.correcting).toEqual({
      mealId: request.mealId,
      eatenAt: request.eatenAt,
      eatenAtText: '2026-11-15T08:30',
      appliedDose: { text: '7', value: 7 },
      // Kept in the notice of the correction, not in the passing notices.
      skipped: [{ foodName: 'Archivado de prueba', reason: 'NOT_IN_CATALOG' }],
    })
    expect(form.eatenAtText).toBe('2026-11-15T08:30')
    expect(form.appliedDoseText).toBe('7')
    expect(form.copyNotice).toBeNull()
  })

  it('if nothing could be brought, the meal in progress stays and only the notices show', () => {
    for (const mode of ['repeat', 'correct'] as const) {
      const form = copiedMealForm(draft, { ...request, mode }, [banana])
      expect(form).toEqual({
        ...draft,
        nextKey: 5,
        focusKey: null,
        notUsableFood: null,
        copyNotice: {
          repeatedFrom: null,
          skipped: [
            { foodName: rice.name, reason: 'NOT_IN_CATALOG' },
            { foodName: 'Archivado de prueba', reason: 'NOT_IN_CATALOG' },
          ],
        },
      })
    }
  })

  it('if nothing could be brought to an empty Inicio, it stays empty', () => {
    const form = copiedMealForm(null, request, [])
    expect(form.items).toEqual([])
    expect(form.correcting).toBeNull()
  })
})
