import { describe, expect, it } from 'vitest'
import type { Food } from '../../lib/foods.ts'
import {
  TABLE_VALUE_INFO,
  isFromTable,
  pickerResults,
  tableFoodAsMealFood,
  tableFoodCopy,
} from './tableFoods.ts'
import type { MealFood, ReferenceFood } from './types.ts'

// Invented data: the codes and values are not the real USDA ones.

function ref(
  code: string,
  name: string,
  carbs = 20,
  description = `Invented ${code}`,
): ReferenceFood {
  return {
    reference_db: 'usda_fdc',
    reference_code: code,
    description_original: description,
    name_es: name,
    state: 'as_eaten',
    carbs_per_100g: carbs,
  }
}

const table: MealFood[] = [
  ref('900001', 'Banana'),
  ref('900002', 'Arroz blanco hervido'),
  ref('900003', 'Arroz integral hervido'),
  ref('900004', 'Arroz parboil hervido'),
  ref('900005', 'Puré de papas'),
  ref('900006', 'Manzana con cáscara'),
].map(tableFoodAsMealFood)

const manual: Food = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Banana',
  brand: null,
  source: 'manual',
  state: 'as_eaten',
  carbs_per_100g: 21,
  cooking_factor: null,
  unit_weight_g: null,
  unit_label: null,
  reference_db: null,
  reference_code: null,
  reference_description: null,
  notes: null,
  archived_at: null,
}

/** The user's copy in the catalog of a table food. */
function copyOf(food: MealFood, id: string, change: Partial<Food> = {}): Food {
  return { ...food, id, ...change }
}

const names = (foods: readonly { name: string }[]) =>
  foods.map((food) => food.name)

describe('tableFoodAsMealFood', () => {
  it('copies every column, without id, brand, factor or unit', () => {
    expect(
      tableFoodAsMealFood(ref('900007', 'Papa hervida', 11.459999999999999)),
    ).toEqual({
      id: null,
      name: 'Papa hervida',
      brand: null,
      source: 'reference',
      state: 'as_eaten',
      carbs_per_100g: 11.459999999999999,
      cooking_factor: null,
      unit_weight_g: null,
      unit_label: null,
      reference_db: 'usda_fdc',
      reference_code: '900007',
      reference_description: 'Invented 900007',
      notes: null,
      archived_at: null,
    })
  })

  it('keeps 0 g of HC and the state of the entry', () => {
    const food = tableFoodAsMealFood(ref('900008', 'Huevo duro', 0))
    expect(food.carbs_per_100g).toBe(0)
    expect(food.state).toBe('as_eaten')
    expect(food.cooking_factor).toBeNull()
  })

  it('does not modify the entry', () => {
    const entry = ref('900009', 'Pera')
    const before = structuredClone(entry)
    tableFoodAsMealFood(entry)
    expect(entry).toEqual(before)
  })
})

describe('isFromTable', () => {
  it('a USDA food, picked or copied, is from the table', () => {
    expect(isFromTable({ source: 'reference', reference_db: 'usda_fdc' })).toBe(
      true,
    )
  })

  it.each([
    ['reference', 'argenfoods'],
    ['manual', null],
    ['label', null],
    ['manual', 'usda_fdc'],
  ] as const)('%s with %s is not', (source, referenceDb) => {
    expect(isFromTable({ source, reference_db: referenceDb })).toBe(false)
  })
})

describe('pickerResults', () => {
  it.each(['', ' ', '   \t '])('an empty query (%j) gives nothing', (query) => {
    expect(pickerResults([manual], table, query)).toEqual({
      catalog: [],
      table: [],
    })
  })

  it('searches without diacritics: "pure" finds "Puré de papas"', () => {
    expect(names(pickerResults([], table, 'pure').table)).toEqual([
      'Puré de papas',
    ])
  })

  it('words in any order: "hervido arroz" gives the three boiled rices, sorted', () => {
    for (const query of ['arroz hervido', 'hervido arroz', 'HERVIDO  Arroz']) {
      expect(names(pickerResults([], table, query).table)).toEqual([
        'Arroz blanco hervido',
        'Arroz integral hervido',
        'Arroz parboil hervido',
      ])
    }
  })

  it('the catalog first, then the table, each sorted', () => {
    const other: Food = { ...manual, id: 'x2', name: 'Arroz casero hervido' }
    const results = pickerResults([manual, other], table, 'a')
    expect(names(results.catalog)).toEqual(['Arroz casero hervido', 'Banana'])
    expect(names(results.table)).toEqual([
      'Arroz blanco hervido',
      'Arroz integral hervido',
      'Arroz parboil hervido',
      'Banana',
      'Manzana con cáscara',
      'Puré de papas',
    ])
  })

  it('a copy among the results hides its table entry', () => {
    const banana = table[0]
    if (banana === undefined) throw new Error('no banana')
    const copy = copyOf(banana, 'c1', { carbs_per_100g: 25 })
    const results = pickerResults([copy], table, 'banana')
    expect(results.catalog).toEqual([copy])
    expect(results.table).toEqual([])
  })

  it('a renamed copy outside the results does not hide its entry', () => {
    const banana = table[0]
    if (banana === undefined) throw new Error('no banana')
    const copy = copyOf(banana, 'c1', { name: 'Fruta amarilla' })
    const results = pickerResults([copy], table, 'banana')
    expect(results.catalog).toEqual([])
    expect(names(results.table)).toEqual(['Banana'])
  })

  it('a renamed copy that matches hides its entry', () => {
    const banana = table[0]
    if (banana === undefined) throw new Error('no banana')
    const copy = copyOf(banana, 'c1', { name: 'Banana de la feria' })
    const results = pickerResults([copy], table, 'banana')
    expect(names(results.catalog)).toEqual(['Banana de la feria'])
    expect(results.table).toEqual([])
  })

  it('a manual food with the same name does not hide the entry', () => {
    const results = pickerResults([manual], table, 'banana')
    expect(results.catalog).toEqual([manual])
    expect(names(results.table)).toEqual(['Banana'])
  })

  it('an ARGENFOODS or manual food with the same code does not hide it', () => {
    const argenfoods: Food = {
      ...manual,
      id: 'a1',
      source: 'reference',
      reference_db: 'argenfoods',
      reference_code: '900001',
    }
    const manualWithCode: Food = {
      ...manual,
      id: 'm2',
      reference_code: '900001',
    }
    const results = pickerResults([argenfoods, manualWithCode], table, 'banana')
    expect(results.catalog).toHaveLength(2)
    expect(names(results.table)).toEqual(['Banana'])
  })

  it('a copy only hides its own entry', () => {
    const rice = table[1]
    if (rice === undefined) throw new Error('no rice')
    const copy = copyOf(rice, 'c2')
    const results = pickerResults([copy], table, 'arroz')
    expect(names(results.catalog)).toEqual(['Arroz blanco hervido'])
    expect(names(results.table)).toEqual([
      'Arroz integral hervido',
      'Arroz parboil hervido',
    ])
  })

  it('no matches gives both groups empty', () => {
    expect(pickerResults([manual], table, 'zzz')).toEqual({
      catalog: [],
      table: [],
    })
  })

  it('an empty table only searches the catalog', () => {
    expect(pickerResults([manual], [], 'banana')).toEqual({
      catalog: [manual],
      table: [],
    })
  })

  it('does not modify its inputs', () => {
    const foods = [manual]
    const before = structuredClone({ foods, table })
    pickerResults(foods, table, 'a')
    expect({ foods, table }).toEqual(before)
  })
})

describe('tableFoodCopy', () => {
  it('the columns of the copy, exactly', () => {
    const food = tableFoodAsMealFood(ref('900010', 'Polenta cocida', 13.16))
    expect(tableFoodCopy(food)).toEqual({
      name: 'Polenta cocida',
      brand: null,
      source: 'reference',
      state: 'as_eaten',
      carbs_per_100g: 13.16,
      reference_db: 'usda_fdc',
      reference_code: '900010',
      reference_description: 'Invented 900010',
    })
  })

  it('has no id or user_id', () => {
    const copy = tableFoodCopy(tableFoodAsMealFood(ref('900011', 'Kiwi')))
    expect(Object.keys(copy)).not.toContain('id')
    expect(Object.keys(copy)).not.toContain('user_id')
  })

  it('throws without a code', () => {
    const food: MealFood = {
      ...tableFoodAsMealFood(ref('900012', 'Uva')),
      reference_code: null,
    }
    expect(() => tableFoodCopy(food)).toThrow()
  })
})

describe('TABLE_VALUE_INFO', () => {
  it('is plain text without technical terms', () => {
    expect(TABLE_VALUE_INFO).not.toMatch(/factor|estado|asimilable/i)
  })
})

describe('pickerResults, more edge cases (tester)', () => {
  const extra: MealFood[] = [
    ref('900020', 'Ñoquis de papa hervidos'),
    ref('900021', 'Piña en almíbar'),
    ref('900022', 'Arroz blanco de grano largo hervido sin sal'),
  ].map(tableFoodAsMealFood)
  const all = [...table, ...extra]

  it('many words must all match, in any order', () => {
    expect(
      names(pickerResults([], all, 'sin largo hervido arroz grano').table),
    ).toEqual(['Arroz blanco de grano largo hervido sin sal'])
    expect(
      names(pickerResults([], all, 'arroz hervido blanco largo xyz').table),
    ).toEqual([])
  })

  it('ñ and diacritics are ignored both ways', () => {
    for (const query of ['noquis', 'ÑOQUIS', 'ñoquis']) {
      expect(names(pickerResults([], all, query).table)).toEqual([
        'Ñoquis de papa hervidos',
      ])
    }
    expect(names(pickerResults([], all, 'PINA ALMIBAR').table)).toEqual([
      'Piña en almíbar',
    ])
    expect(names(pickerResults([], all, 'puré').table)).toEqual([
      'Puré de papas',
    ])
  })

  it('leading, trailing and repeated spaces do not change the results', () => {
    expect(pickerResults([], all, '  arroz    blanco  ')).toEqual(
      pickerResults([], all, 'arroz blanco'),
    )
  })

  it('two copies of the same code: both in the catalog, the entry hidden', () => {
    const banana = table[0]
    if (banana === undefined) throw new Error('no banana')
    const first = copyOf(banana, 'c1')
    const second = copyOf(banana, 'c2', { carbs_per_100g: 22 })
    const results = pickerResults([first, second], table, 'banana')
    expect(results.catalog.map((food) => food.id).toSorted()).toEqual([
      'c1',
      'c2',
    ])
    expect(results.table).toEqual([])
  })

  it('a copy hides its entry even with a different name, if both match', () => {
    const rice = table[1]
    if (rice === undefined) throw new Error('no rice')
    const copy = copyOf(rice, 'c3', { name: 'Arroz de casa' })
    const results = pickerResults([copy], table, 'arroz')
    expect(names(results.catalog)).toEqual(['Arroz de casa'])
    expect(names(results.table)).toEqual([
      'Arroz integral hervido',
      'Arroz parboil hervido',
    ])
  })

  it('a label food with a USDA code does not hide the entry', () => {
    const label: Food = {
      ...manual,
      id: 'l1',
      source: 'label',
      reference_db: 'usda_fdc',
      reference_code: '900001',
    }
    expect(names(pickerResults([label], table, 'banana').table)).toEqual([
      'Banana',
    ])
  })

  it('a USDA copy without a code hides nothing', () => {
    const banana = table[0]
    if (banana === undefined) throw new Error('no banana')
    const noCode = copyOf(banana, 'c4', { reference_code: null })
    expect(names(pickerResults([noCode], table, 'banana').table)).toEqual([
      'Banana',
    ])
  })
})

describe('isFromTable, more cases (tester)', () => {
  it('a label food with usda_fdc is not from the table', () => {
    expect(isFromTable({ source: 'label', reference_db: 'usda_fdc' })).toBe(
      false,
    )
  })

  it('a reference food without a database is not', () => {
    expect(isFromTable({ source: 'reference', reference_db: null })).toBe(false)
  })
})
