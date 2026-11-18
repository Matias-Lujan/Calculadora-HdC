import { describe, expect, it, vi } from 'vitest'
import type { Food } from '../../lib/foods.ts'
import {
  RECENT_FOODS_MAX,
  isAtThisTime,
  recentFoods,
  suggestedMeals,
} from './recentMeals.ts'
import type { CopyableMealItem, RecentMeal } from './types.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))

// Invented data. Buenos Aires is UTC−3 all year.

function food(n: number, overrides: Partial<Food> = {}): Food {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name: `Alimento ${n}`,
    brand: null,
    source: 'manual',
    state: 'as_eaten',
    carbs_per_100g: 20,
    cooking_factor: null,
    unit_weight_g: null,
    unit_label: null,
    reference_db: null,
    reference_code: null,
    reference_description: null,
    notes: null,
    photo_path: null,
    archived_at: null,
    ...overrides,
  }
}

function item(position: number, of: Food): CopyableMealItem {
  return {
    position,
    food_id: of.id,
    food_name: of.name,
    quantity_mode: 'grams',
    units: null,
    grams: 100,
  }
}

let mealCount = 0
function meal(eatenAt: string, items: CopyableMealItem[] = []): RecentMeal {
  mealCount += 1
  return {
    id: `00000000-0000-4000-8000-0000000001${String(mealCount).padStart(2, '0')}`,
    eaten_at: eatenAt,
    total_carbs_g: 45.5,
    meal_items: items.length > 0 ? items : [item(0, food(1))],
  }
}

describe('recentFoods', () => {
  const foods = Array.from({ length: 9 }, (_, i) => food(i + 1))
  const [a, b, c, d, e, f, g, h] = foods as [
    Food,
    Food,
    Food,
    Food,
    Food,
    Food,
    Food,
    Food,
    Food,
  ]

  it('the foods of the most recent meals, each once, in the order of each meal', () => {
    const meals = [
      // The items come in any order: by position.
      meal('2026-11-16T12:00:00+00:00', [item(1, b), item(0, a)]),
      meal('2026-11-15T12:00:00+00:00', [item(0, a), item(1, c)]),
    ]
    expect(recentFoods(meals, foods)).toEqual([a, b, c])
  })

  it('the same food twice in a meal counts once', () => {
    const meals = [meal('2026-11-16T12:00:00+00:00', [item(0, a), item(1, a)])]
    expect(recentFoods(meals, foods)).toEqual([a])
  })

  it(`at most ${RECENT_FOODS_MAX}`, () => {
    const meals = [
      meal('2026-11-16T12:00:00+00:00', [item(0, a), item(1, b), item(2, c)]),
      meal('2026-11-15T12:00:00+00:00', [item(0, d), item(1, e), item(2, f)]),
      meal('2026-11-14T12:00:00+00:00', [item(0, g), item(1, h)]),
    ]
    expect(recentFoods(meals, foods)).toEqual([a, b, c, d, e, f])
  })

  it('takes them as they are now in the catalog', () => {
    const renamed = { ...a, name: 'Otro nombre', carbs_per_100g: 30 }
    const meals = [meal('2026-11-16T12:00:00+00:00', [item(0, a)])]
    expect(recentFoods(meals, [renamed])).toEqual([renamed])
  })

  it('leaves out a food that is not in the catalog (archived or gone), and the next one takes its place', () => {
    const meals = [
      meal('2026-11-16T12:00:00+00:00', [item(0, a), item(1, b)]),
      meal('2026-11-15T12:00:00+00:00', [
        item(0, c),
        item(1, d),
        item(2, e),
        item(3, f),
        item(4, g),
      ]),
    ]
    const withoutB = foods.filter((one) => one !== b)
    expect(recentFoods(meals, withoutB)).toEqual([a, c, d, e, f, g])
  })

  it('leaves out a cooked food that has no yield now (it cannot be picked)', () => {
    const cooked = food(20, { state: 'raw_cooked', cooking_factor: null })
    const rice = food(21, { state: 'raw_cooked', cooking_factor: 2.6 })
    const meals = [
      meal('2026-11-16T12:00:00+00:00', [item(0, cooked), item(1, rice)]),
    ]
    expect(recentFoods(meals, [cooked, rice])).toEqual([rice])
  })

  it('nothing without meals or without catalog', () => {
    expect(recentFoods([], foods)).toEqual([])
    expect(
      recentFoods([meal('2026-11-16T12:00:00+00:00', [item(0, a)])], []),
    ).toEqual([])
  })
})

describe('isAtThisTime', () => {
  // 13:00 in Buenos Aires.
  const now = new Date('2026-11-16T16:00:00Z')

  it.each([
    // [eaten_at, expected]
    ['2026-11-15T16:00:00+00:00', true], // yesterday at the same time
    ['2026-11-15T14:00:00+00:00', true], // 2 hours before, exactly
    ['2026-11-15T18:00:00+00:00', true], // 2 hours after, exactly
    ['2026-11-15T13:59:59+00:00', false], // 2 hours and a second before
    ['2026-11-15T18:00:01+00:00', false], // 2 hours and a second after
    ['2026-11-16T15:30:00+00:00', false], // today, half an hour ago: just eaten
    ['2026-11-16T14:00:00+00:00', false], // today, 2 hours ago: just eaten
    ['2026-11-09T16:00:00+00:00', true], // 7 days ago, exactly
    ['2026-11-09T15:59:59+00:00', false], // a second more than 7 days
    ['2026-11-16T16:00:00+00:00', false], // now
    ['2026-11-16T16:00:01+00:00', false], // in the future
    ['2026-11-17T16:00:00+00:00', false], // tomorrow at this time
  ])('%s: %s', (eatenAt, expected) => {
    expect(isAtThisTime(eatenAt, now)).toBe(expected)
  })

  it('across midnight: 23:30 and 00:30 are one hour apart', () => {
    // 00:30 in Buenos Aires.
    const afterMidnight = new Date('2026-11-16T03:30:00Z')
    // 23:30 of the day before.
    expect(isAtThisTime('2026-11-15T02:30:00+00:00', afterMidnight)).toBe(true)
    // 23:30 of two days before.
    expect(isAtThisTime('2026-11-14T02:30:00+00:00', afterMidnight)).toBe(true)
    // 22:29: more than two hours before 00:30.
    expect(isAtThisTime('2026-11-15T01:29:00+00:00', afterMidnight)).toBe(false)

    // 23:30 now, a meal at 01:00 of the same night (yesterday's date).
    const beforeMidnight = new Date('2026-11-16T02:30:00Z')
    expect(isAtThisTime('2026-11-15T04:00:00+00:00', beforeMidnight)).toBe(true)
  })

  it('uses the time of Buenos Aires, not UTC', () => {
    // 13:00 in Buenos Aires is 16:00 UTC: a meal at 13:00 UTC (10:00 in
    // Buenos Aires) is three hours away, although its UTC time would be
    // the same as now's in Buenos Aires.
    expect(isAtThisTime('2026-11-15T13:00:00+00:00', now)).toBe(false)
    // With another offset: 13:30 in Buenos Aires.
    expect(isAtThisTime('2026-11-15T13:30:00-03:00', now)).toBe(true)
  })
})

describe('suggestedMeals', () => {
  // 08:30 in Buenos Aires.
  const now = new Date('2026-11-16T11:30:00Z')

  it('null without meals', () => {
    expect(suggestedMeals([], now)).toBeNull()
  })

  it('"A esta hora comiste": up to 3, in the order of the list', () => {
    const breakfasts = [
      meal('2026-11-15T11:30:00+00:00'),
      meal('2026-11-14T11:00:00+00:00'),
      meal('2026-11-13T12:00:00+00:00'),
      meal('2026-11-12T11:45:00+00:00'),
    ]
    const lunch = meal('2026-11-15T16:00:00+00:00')
    const meals = [lunch, ...breakfasts]
    expect(suggestedMeals(meals, now)).toEqual({
      title: 'A esta hora comiste',
      meals: breakfasts.slice(0, 3),
    })
  })

  it('only the ones at this time, even if they are fewer than 3', () => {
    const breakfast = meal('2026-11-15T11:30:00+00:00')
    const lunch = meal('2026-11-15T16:00:00+00:00')
    expect(suggestedMeals([lunch, breakfast], now)).toEqual({
      title: 'A esta hora comiste',
      meals: [breakfast],
    })
  })

  it('"Tus últimas comidas" if none is at this time: the first 3', () => {
    const meals = [
      meal('2026-11-15T16:00:00+00:00'),
      meal('2026-11-15T00:00:00+00:00'),
      meal('2026-11-14T16:00:00+00:00'),
      meal('2026-11-14T00:00:00+00:00'),
    ]
    expect(suggestedMeals(meals, now)).toEqual({
      title: 'Tus últimas comidas',
      meals: meals.slice(0, 3),
    })
  })

  it('a meal at this time but older than 7 days does not count', () => {
    const old = meal('2026-11-01T11:30:00+00:00')
    expect(suggestedMeals([old], now)).toEqual({
      title: 'Tus últimas comidas',
      meals: [old],
    })
  })
})

describe('isAtThisTime: what was just eaten', () => {
  it('a meal of less than 3 hours ago is never offered, even at this time of day', () => {
    // 00:30 in Buenos Aires; a meal at 23:30 of an hour ago.
    const now = new Date('2026-11-16T03:30:00Z')
    expect(isAtThisTime('2026-11-16T02:30:00+00:00', now)).toBe(false)
    expect(isAtThisTime('2026-11-16T03:29:59+00:00', now)).toBe(false)
  })

  it('the same time yesterday is offered', () => {
    const now = new Date('2026-11-16T03:30:00Z')
    expect(isAtThisTime('2026-11-15T02:30:00+00:00', now)).toBe(true)
  })
})
