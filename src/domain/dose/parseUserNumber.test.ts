import { describe, expect, it } from 'vitest'
import { formatCarbs, formatDose } from './format.ts'
import { parseUserNumber } from './parseUserNumber.ts'
import { applyTypedEdit } from './applyTypedEdit.ts'

/** Types `keys` one by one into an empty field, with the caret at the end. */
function typeKeys(keys: string): string {
  let field = ''
  for (const key of keys) {
    const at = field.length
    field = applyTypedEdit(field, { start: at, end: at, inserted: key }).value
  }
  return field
}

/** Pastes `text` into an empty field. */
function pasteIntoEmpty(text: string): string {
  return applyTypedEdit('', { start: 0, end: 0, inserted: text }).value
}

describe('parseUserNumber', () => {
  it.each([
    ['12,5', 12.5],
    ['15', 15],
    ['0', 0],
    ['0,0', 0],
    ['00', 0],
    ['012', 12],
    ['1500', 1500],
    ['1.500', 1500],
    ['1.234.567', 1234567],
    ['1.500,25', 1500.25],
    ['0,5', 0.5],
    ['  12,5  ', 12.5],
    ['\t12,5\t', 12.5],
    ['\u00a012,5\u00a0', 12.5],
  ])('%j → %s', (text, expected) => {
    expect(parseUserNumber(text)).toBe(expected)
  })

  it.each([
    ['0,1', 0.1],
    ['2,675', 2.675],
    ['1,005', 1.005],
    ['12,345678901', 12.345678901],
    ['0,0000001', 0.0000001],
  ])('no redondea: %j → %s', (text, expected) => {
    expect(parseUserNumber(text)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    '\u00a0',
    ',',
    '.',
    // Nothing is filled in: a missing integer or decimal part is incomplete.
    ',5',
    '12,',
    '0,',
    '1.500,',
    // A dot is never a decimal separator.
    '12.5',
    '0.25',
    // Badly grouped thousands.
    '1.50',
    '15.00',
    '1.5000',
    '.500',
    '1.',
    '-5',
    '-0',
    '+5',
    '12,5,',
    '12,5,3',
    '1,2,3',
    '1,5.0',
    '1,234.5',
    '12 ,5',
    '12 5',
    '1 000',
    '12,5 g',
    '30g',
    '<0,5',
    '12%',
    'abc',
    '1e3',
    '0x10',
    'Infinity',
    'NaN',
    '١٢',
    '9'.repeat(400),
  ])('%j da null', (text) => {
    expect(parseUserNumber(text)).toBeNull()
  })
})

describe('parseUserNumber: casos borde', () => {
  it.each([
    ['0,500', 0.5],
    ['0,000', 0],
    ['12,0', 12],
    ['007,50', 7.5],
    ['1.234,56', 1234.56],
    ['1.000.000,5', 1000000.5],
    ['1.000.000.000.000.000.000', 1e18],
    ['999', 999],
    ['1.000', 1000],
    [' 12,5 ', 12.5],
    ['\n12\r\n', 12],
    ['\uFEFF12', 12],
    // The largest numbers that still fit are accepted.
    ['1' + '0'.repeat(308), 1e308],
  ])('%j → %s', (text, expected) => {
    expect(parseUserNumber(text)).toBe(expected)
  })

  it.each([
    // Full-width, Arabic-Indic and other non-ASCII digits or separators.
    '１２',
    '1２',
    '٫5',
    '١٬٥٠٠',
    // Thousands separators of other locales.
    '1 500',
    '1\u00a0500',
    '1’500',
    '1,500.25',
    // Control characters inside or around.
    '1\u00002',
    '\u000012',
    '12\u0000',
    // Badly grouped thousands, partial groups and extra dots.
    '1234.567',
    '12.345.67',
    '1..500',
    '1.500.',
    '.5',
    '1.0000',
    '1234.567,5',
    // Overflow.
    '1' + '0'.repeat(309),
    '1.' + '000.'.repeat(110) + '000',
  ])('%j da null', (text) => {
    expect(parseUserNumber(text)).toBeNull()
  })
})

describe('parseUserNumber con lo que muestra el campo', () => {
  it.each([
    ['1500', 1500],
    ['1500,25', 1500.25],
    ['12,5', 12.5],
    ['05', 5],
    ['0,5', 0.5],
    // The typed dot becomes the decimal comma.
    ['12.5', 12.5],
    // The second comma does not go in.
    ['12,5,3', 12.53],
  ])('tecla por tecla, %j da %s', (keys, expected) => {
    expect(parseUserNumber(typeKeys(keys))).toBe(expected)
  })

  it.each([',', ',5', '12,', '-', 'abc'])(
    'tecla por tecla, %j queda incompleto o vacío: da null',
    (keys) => {
      expect(parseUserNumber(typeKeys(keys))).toBeNull()
    },
  )

  it('acepta lo que muestra la app', () => {
    expect(parseUserNumber(formatDose(8.5493))).toBe(8.55)
    expect(parseUserNumber(formatCarbs(1234.56))).toBe(1234.6)
    expect(parseUserNumber(pasteIntoEmpty(formatCarbs(1234.56)))).toBe(1234.6)
  })
})

/** Small deterministic PRNG (mulberry32), so generated cases are reproducible. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Valid texts built on purpose (random ones are rarely valid). */
function generateValidTexts(count: number, seed: number): string[] {
  const random = makeRandom(seed)
  const digits = (n: number) => {
    let s = ''
    for (let i = 0; i < n; i++) s += String(Math.floor(random() * 10))
    return s
  }
  const texts: string[] = []
  for (let i = 0; i < count; i++) {
    const integer = digits(1 + Math.floor(random() * 12))
    const grouped =
      random() < 0.5 ? integer.replace(/\B(?=(?:\d{3})+$)/g, '.') : integer
    const decimal =
      random() < 0.5 ? ',' + digits(1 + Math.floor(random() * 6)) : ''
    const text = grouped + decimal
    texts.push(random() < 0.2 ? ` ${text}\u00a0` : text)
  }
  return texts
}

describe('parseUserNumber: propiedades sobre entradas generadas', () => {
  it('un texto válido da la misma cuenta que hecha a mano', () => {
    for (const text of generateValidTexts(2000, 99)) {
      const plain = text.trim().replaceAll('.', '').replace(',', '.')
      expect(parseUserNumber(text), JSON.stringify(text)).toBe(Number(plain))
    }
  })

  it('pegar un texto válido en un campo vacío no cambia el número', () => {
    for (const text of generateValidTexts(2000, 7)) {
      const core = text.trim()
      expect(parseUserNumber(pasteIntoEmpty(core)), JSON.stringify(core)).toBe(
        parseUserNumber(core),
      )
    }
  })

  it('el texto con un carácter de más alrededor de un dígito da null', () => {
    for (const text of generateValidTexts(500, 5)) {
      const core = text.trim()
      for (const extra of ['-', '+', 'g', '%', '.', ',', 'e1', '\u0000']) {
        expect(parseUserNumber(core + extra), core + extra).toBeNull()
      }
    }
  })
})

describe('parseUserNumber: la coma siempre es decimal', () => {
  it.each([
    ['1,500', 1.5],
    ['1,000', 1],
    ['0001', 1],
    ['0,05', 0.05],
    ['1.000,000', 1000],
  ])('%j → %s', (text, expected) => {
    expect(parseUserNumber(text)).toBe(expected)
  })

  it.each(['1.234.5', '1.500,2.5', ',', '0,', '.,5', '1.,5', '1,.5'])(
    '%j da null',
    (text) => {
      expect(parseUserNumber(text)).toBeNull()
    },
  )
})
