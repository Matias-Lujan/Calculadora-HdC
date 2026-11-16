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
    'Carbohidratos, de los cuales:',
    'Carbohidratos, de los cuales',
    'Carbohidratos de los cuales',
    'Carbohidratos de los cuales:',
    'Carbohidratos (g), de los cuales:',
    'Hidratos de carbono, de los cuales:',
    'Carbohidratos disponibles, de los cuales',
    'CARBOHIDRATOS, DE LOS CUALES:',
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
    'Azúcares totales, de los cuales:',
    'Carbohidratos totales, de los cuales:',
    'De los cuales:',
    'Carbohidratos disponibles y fibra',
    '',
    '   ',
  ])('"%s" no es el rótulo habitual', (text) => {
    expect(isMercosurCarbsLabel(text)).toBe(false)
  })
})
