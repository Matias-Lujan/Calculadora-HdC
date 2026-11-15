import { describe, expect, it } from 'vitest'
import { isMercosurCarbsLabel } from './index.ts'

describe('isMercosurCarbsLabel', () => {
  it.each([
    'Carbohidratos',
    'carbohidratos',
    'CARBOHIDRATOS',
    'Hidratos de carbono',
    'Hidratos  de   carbono',
    'Carbohidratos disponibles',
    'Hidratos de carbono disponibles',
    '  Carbohidratos  ',
    'Carbohidratos (g)',
    'Carbohidratos(g)',
    'Carbohidratos g',
    'Carbohidratos:',
    'Carbohidratos (g):',
    'Carbohidratos.',
    'Carbohidrátos',
  ])('"%s" es el rótulo habitual', (text) => {
    expect(isMercosurCarbsLabel(text)).toBe(true)
  })

  it.each([
    'Total Carbohydrate',
    'Carbohydrates',
    'Carbohidratos totales',
    'Carbohidratos totales (g):',
    'Hidratos de carbono totales',
    'Azúcares',
    'Carbohidratos disponibles y fibra',
    '',
    '   ',
  ])('"%s" no es el rótulo habitual', (text) => {
    expect(isMercosurCarbsLabel(text)).toBe(false)
  })
})
