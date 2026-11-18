import { describe, expect, it, vi } from 'vitest'
import type { Food } from './foods.ts'
import {
  FROM_MEAL_STATE,
  addToMealState,
  foodToAddToMeal,
  fromMealState,
  isFromMeal,
  nameFromMeal,
} from './mealHandoff.ts'

vi.mock('./supabase.ts', () => ({ supabase: {} }))

// Invented data.
const food: Food = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Galletitas de prueba',
  brand: 'Marca inventada',
  source: 'label',
  state: 'as_eaten',
  carbs_per_100g: 70,
  cooking_factor: null,
  unit_weight_g: 10,
  unit_label: 'galletita',
  reference_db: null,
  reference_code: null,
  reference_description: null,
  notes: null,
  photo_path: 'user/photo.jpg',
  archived_at: null,
}

describe('isFromMeal', () => {
  it('recognizes only the state Inicio sends', () => {
    expect(isFromMeal(FROM_MEAL_STATE)).toBe(true)
    expect(isFromMeal(null)).toBe(false)
    expect(isFromMeal(undefined)).toBe(false)
    expect(isFromMeal({ fromMeal: 'true' })).toBe(false)
    expect(isFromMeal({})).toBe(false)
  })
})

describe('fromMealState and nameFromMeal ("Agregar a mano")', () => {
  it('opened from Inicio, with what was searched as the name', () => {
    const state: unknown = JSON.parse(JSON.stringify(fromMealState('milanesa')))
    expect(isFromMeal(state)).toBe(true)
    expect(nameFromMeal(state)).toBe('milanesa')
  })

  it('without a name: the same state as the photo, and an empty name', () => {
    expect(fromMealState()).toEqual(FROM_MEAL_STATE)
    expect(nameFromMeal(FROM_MEAL_STATE)).toBe('')
  })

  it('an empty name, or a state that is not from Inicio', () => {
    expect(nameFromMeal(null)).toBe('')
    expect(nameFromMeal({ name: 'milanesa' })).toBe('')
    expect(isFromMeal({ fromMeal: true, name: 3 })).toBe(false)
    expect(nameFromMeal({ fromMeal: true, name: 3 })).toBe('')
  })
})

describe('foodToAddToMeal', () => {
  it('gives back the food of addToMealState', () => {
    expect(foodToAddToMeal(addToMealState(food))).toEqual(food)
  })

  it('survives a JSON round trip (history.state after a reload)', () => {
    const state: unknown = JSON.parse(JSON.stringify(addToMealState(food)))
    expect(foodToAddToMeal(state)).toEqual(food)
  })

  it('gives null without a valid food', () => {
    expect(foodToAddToMeal(null)).toBeNull()
    expect(foodToAddToMeal(FROM_MEAL_STATE)).toBeNull()
    expect(foodToAddToMeal({ addToMeal: { ...food, id: null } })).toBeNull()
    expect(
      foodToAddToMeal({ addToMeal: { ...food, carbs_per_100g: '70' } }),
    ).toBeNull()
    expect(
      foodToAddToMeal({ addToMeal: { ...food, state: 'cooked' } }),
    ).toBeNull()
  })
})
