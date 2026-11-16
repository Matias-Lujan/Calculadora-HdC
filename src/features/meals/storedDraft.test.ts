import { describe, expect, it, vi } from 'vitest'
import type { Food } from '../../lib/foods.ts'
import {
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
      nextKey: 0,
      focusKey: null,
      notUsableFood: null,
    })
  })

  it('restores the stored draft as it was', () => {
    expect(initialMealForm(draft, null)).toEqual({
      ...draft,
      nextKey: 5,
      focusKey: null,
      notUsableFood: null,
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
    })
  })
})
