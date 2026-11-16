import { describe, expect, it } from 'vitest'
import { parseLabelNumber } from './parseLabelNumber.ts'

describe('parseLabelNumber', () => {
  it.each([
    ['12,5', 12.5],
    ['12', 12],
    ['0', 0],
    ['0,0', 0],
    ['78,0', 78],
    ['1234,5', 1234.5],
    ['1.234,5', 1234.5],
    ['12.5', 12.5],
    ['0.25', 0.25],
    ['  12,5  ', 12.5],
  ])('"%s" → %s', (text, expected) => {
    expect(parseLabelNumber(text)).toBe(expected)
  })

  it.each([
    ['12,5 g', 12.5],
    ['12,5g', 12.5],
    ['30 gr', 30],
    ['30 grs.', 30],
    ['30 G', 30],
    // Real labels (stage 1b probe): "Porción: 80 gramos (1 plato)".
    ['80 gramos', 80],
    ['80gramos', 80],
    ['80 Gramos', 80],
    ['1 gramo', 1],
  ])('ignora la unidad: "%s" → %s', (text, expected) => {
    expect(parseLabelNumber(text)).toBe(expected)
  })

  it.each(['<0,5', '< 0,5', '≤0,5', 'menos de 0,5', '<0,5 g'])(
    'una cota como "%s" no es un valor: da null',
    (text) => {
      expect(parseLabelNumber(text)).toBeNull()
    },
  )

  it.each(['1.234', '0.500', '1.234 g'])(
    'un punto seguido de 3 dígitos es ambiguo: "%s" da null',
    (text) => {
      expect(parseLabelNumber(text)).toBeNull()
    },
  )

  it.each([
    'abc',
    '-',
    '—',
    'N/A',
    'no aporta cantidades significativas',
    '-5',
    '12,5%',
    '1,2,3',
    '1.234.5',
    '1,234.5',
    '12 , 5',
    'g',
    '',
    '   ',
  ])('un texto no numérico como "%s" da null', (text) => {
    expect(parseLabelNumber(text)).toBeNull()
  })

  it.each([
    ['400 nueves', '9'.repeat(400)],
    ['400 nueves con coma decimal', '9'.repeat(400) + ',5'],
    ['400 nueves con punto decimal', '9'.repeat(400) + '.5'],
    ['con puntos de miles', '1' + '.000'.repeat(103) + ',5'],
  ])('un número que no entra (%s) da null', (_, text) => {
    expect(parseLabelNumber(text)).toBeNull()
  })

  it('un número enorme que todavía entra (1 seguido de 308 ceros) se devuelve', () => {
    expect(parseLabelNumber('1' + '0'.repeat(308))).toBe(1e308)
  })

  it('null da null', () => {
    expect(parseLabelNumber(null)).toBeNull()
  })
})
