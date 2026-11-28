import { describe, expect, it } from 'vitest'
import type { Food } from '../../lib/foods.ts'
import {
  foodDetailMainAction,
  foodDetailSentences,
  foodKeyFigure,
} from './foodDetail.ts'

// Invented data.
const food: Food = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Alfajor de prueba',
  brand: null,
  source: 'manual',
  state: 'as_eaten',
  carbs_per_100g: 58,
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

const rice: Food = {
  ...food,
  name: 'Arroz de prueba',
  state: 'raw_cooked',
  carbs_per_100g: 78,
  cooking_factor: 2.6,
}

describe('foodKeyFigure', () => {
  it('eaten as it is', () => {
    expect(foodKeyFigure(food)).toEqual({
      amount: '58,0 g',
      rest: 'de HC cada 100 g',
    })
  })

  it('eaten cooked: in raw', () => {
    expect(foodKeyFigure(rice)).toEqual({
      amount: '78,0 g',
      rest: 'de HC cada 100 g, en crudo',
    })
  })

  it('the carbs with 1 decimal, rounded half up', () => {
    expect(foodKeyFigure({ ...food, carbs_per_100g: 27.75 }).amount).toBe(
      '27,8 g',
    )
    expect(foodKeyFigure({ ...food, carbs_per_100g: 0 }).amount).toBe('0,0 g')
  })
})

describe('foodDetailSentences', () => {
  it('eaten as it is, without a unit', () => {
    expect(foodDetailSentences(food)).toEqual(['Se come tal cual.'])
  })

  it('with a unit: its weight exact', () => {
    expect(
      foodDetailSentences({
        ...food,
        unit_weight_g: 50,
        unit_label: 'alfajor',
      }),
    ).toEqual(['Se come tal cual.', '1 alfajor = 50 g.'])
    expect(foodDetailSentences({ ...food, unit_weight_g: 9.25 })).toEqual([
      'Se come tal cual.',
      '1 unidad = 9,25 g.',
    ])
  })

  it('eaten cooked: how much it yields', () => {
    expect(foodDetailSentences(rice)).toEqual([
      'Al cocinarlo, 100 g crudo rinden 260 g cocido.',
    ])
  })

  it('eaten cooked with a yield that cannot be shown', () => {
    expect(foodDetailSentences({ ...rice, cooking_factor: 1e307 })).toEqual([
      'No se puede mostrar cuánto rinde al cocinarlo. Revisalo con "Editar".',
    ])
  })

  it('eaten cooked without how much it yields: no sentence (the mark shows)', () => {
    expect(foodDetailSentences({ ...rice, cooking_factor: null })).toEqual([])
  })
})

describe('foodDetailMainAction', () => {
  it('a food that can go in a meal: "Usar en una comida"', () => {
    expect(foodDetailMainAction(food)).toBe('use')
    expect(foodDetailMainAction(rice)).toBe('use')
  })

  it('eaten cooked without how much it yields: "Cargar cuánto rinde"', () => {
    expect(foodDetailMainAction({ ...rice, cooking_factor: null })).toBe(
      'load-yield',
    )
  })

  it('eaten as it is with a stray factor: it can be used (the factor is ignored)', () => {
    expect(foodDetailMainAction({ ...food, cooking_factor: 2.6 })).toBe('use')
  })

  it('archived: none', () => {
    const archived = '2026-11-14T16:05:00+00:00'
    expect(foodDetailMainAction({ ...food, archived_at: archived })).toBeNull()
    expect(
      foodDetailMainAction({
        ...rice,
        cooking_factor: null,
        archived_at: archived,
      }),
    ).toBeNull()
  })
})
