import { describe, expect, it } from 'vitest'
import {
  applyTypedEdit,
  type TypedEdit,
  type TypedEditResult,
} from './applyTypedEdit.ts'
import { formatCarbs } from './format.ts'
import { parseUserNumber } from './parseUserNumber.ts'

/** Typing or pasting `inserted` at `at`, with nothing selected. */
function typeAt(at: number, inserted: string): TypedEdit {
  return { start: at, end: at, inserted }
}

/** Replacing the selection [start, end) with `inserted`. */
function replace(start: number, end: number, inserted: string): TypedEdit {
  return { start, end, inserted }
}

/** Backspace with the caret at `caret` and nothing selected. */
function backspace(caret: number): TypedEdit {
  return { start: caret - 1, end: caret, inserted: '' }
}

/** Types `keys` one by one into an empty field, following the caret. */
function typeKeys(keys: string): TypedEditResult[] {
  let field = ''
  let caret = 0
  const steps: TypedEditResult[] = []
  for (const key of keys) {
    const step = applyTypedEdit(field, typeAt(caret, key))
    field = step.value
    caret = step.caret
    steps.push(step)
  }
  return steps
}

/** A text the app can produce: dots only as thousands separators. */
const CANONICAL = /^(?:0|[1-9]\d{0,2}(?:\.\d{3})*)?(?:,\d*)?$/

type Case = [string, TypedEdit, string, number]

describe('applyTypedEdit: cambios aceptados sin aviso', () => {
  it.each<Case>([
    // Digits: the thousands dots are added and moved by the app.
    ['', typeAt(0, '1'), '1', 1],
    ['', typeAt(0, '1500'), '1.500', 5],
    ['150', typeAt(3, '0'), '1.500', 5],
    ['1.500', typeAt(5, '0'), '15.000', 6],
    // Inserting a digit in the middle regroups; the caret follows the digit.
    ['1.500', typeAt(1, '2'), '12.500', 2],
    ['1.500', typeAt(3, '0'), '15.000', 4],
    ['1.234', typeAt(4, '9'), '12.394', 5],
    // Deleting a digit regroups.
    ['15.000', backspace(6), '1.500', 5],
    // Deleting only a thousands dot leaves the same text (the app puts the
    // dot back), with the caret before it.
    ['1.500', backspace(2), '1.500', 1],
    // Comma and decimal part, as typed.
    ['12', typeAt(2, ','), '12,', 3],
    ['12,', typeAt(3, '5'), '12,5', 4],
    ['1.500', typeAt(5, ','), '1.500,', 6],
    ['1.500,2', typeAt(7, '5'), '1.500,25', 8],
    ['1.500,250', typeAt(9, '0'), '1.500,2500', 10],
    // Nothing is filled in.
    ['', typeAt(0, ','), ',', 1],
    [',', typeAt(1, '5'), ',5', 2],
    // Leading zeros: the dropped zero does not count for the caret.
    ['0', typeAt(1, '5'), '5', 1],
    ['0', typeAt(1, '0'), '0', 1],
    ['0', typeAt(1, '123'), '123', 3],
    ['0,', typeAt(2, '5'), '0,5', 3],
    ['0,5', typeAt(2, '0'), '0,05', 3],
    ['100', backspace(1), '0', 0],
    ['1.005', backspace(1), '5', 0],
    ['1.000', backspace(1), '0', 0],
    ['1.000,5', backspace(1), '0,5', 0],
    ['', typeAt(0, '0000001'), '1', 1],
    ['', typeAt(0, '0'), '0', 1],
    // Deleting the comma joins both parts and regroups.
    ['1,5', backspace(2), '15', 1],
    ['12,', backspace(3), '12', 2],
    [',5', backspace(1), '5', 0],
    ['1.234,5', backspace(6), '12.345', 5],
    // Deleting and replacing.
    ['1', backspace(1), '', 0],
    ['1.234', replace(0, 5, '5'), '5', 1],
    ['1.234', replace(0, 5, ''), '', 0],
    ['1.234', replace(1, 3, ','), '1,34', 2],
    ['1.234.567', replace(1, 5, '9'), '19.567', 2],
    ['12,5', replace(0, 4, '9'), '9', 1],
    ['12,5', replace(3, 4, '9'), '12,9', 4],
    // Typing or pasting digits and a comma in the middle.
    ['12', typeAt(1, ','), '1,2', 2],
    ['1.234', typeAt(4, ','), '123,4', 4],
    ['1.234', typeAt(3, ','), '12,34', 3],
    ['12,5', typeAt(2, '99'), '1.299,5', 5],
    // A comma typed before a thousands dot: that dot was the app's.
    ['1.234', typeAt(1, ','), '1,234', 2],
    // Pasting a valid number into an empty field.
    ['', typeAt(0, '1.234,56'), '1.234,56', 8],
    ['', typeAt(0, '1234,56'), '1.234,56', 8],
    ['  ', replace(0, 2, '1.500'), '1.500', 5],
    ['1.234', replace(0, 5, '1.500'), '1.500', 5],
  ])('%j con %j → %j, cursor en %i', (previous, edit, value, caret) => {
    expect(applyTypedEdit(previous, edit)).toEqual({
      value,
      caret,
      notice: null,
    })
  })
})

describe('applyTypedEdit: "." tipeado', () => {
  it.each<Case>([
    // It becomes the decimal comma, in the same place.
    ['12', typeAt(2, '.'), '12,', 3],
    ['', typeAt(0, '.'), ',', 1],
    ['1', typeAt(0, '.'), ',1', 1],
    ['125', typeAt(2, '.'), '12,5', 3],
    ['1.500', typeAt(5, '.'), '1.500,', 6],
    ['0', typeAt(1, '.'), '0,', 2],
    ['10', typeAt(1, '.'), '1,0', 2],
    ['00', typeAt(2, '.'), '0,', 2],
    // The other dots were thousands dots: none stays after the comma.
    ['1.500', typeAt(1, '.'), '1,500', 2],
    ['1.500', typeAt(2, '.'), '1,500', 2],
    ['1.500', typeAt(0, '.'), ',1500', 1],
    ['1.500', typeAt(3, '.'), '15,00', 3],
    ['1.500', typeAt(4, '.'), '150,0', 4],
    ['1.234.567', typeAt(7, '.'), '12.345,67', 7],
    ['1.234.567', typeAt(9, '.'), '1.234.567,', 10],
    ['1.234.567', typeAt(3, '.'), '12,34567', 3],
    // Replacing a selection with ".".
    ['1.234', replace(0, 3, '.'), ',34', 1],
    ['1.234', replace(0, 5, '.'), ',', 1],
    ['1.234', replace(2, 4, '.'), '1,4', 2],
    ['12', replace(1, 2, '.'), '1,', 2],
    ['12,5', replace(2, 3, '.'), '12,5', 3],
    ['92.597.366', replace(2, 5, '.'), '92,7366', 3],
  ])('%j con %j → %j, cursor en %i', (previous, edit, value, caret) => {
    expect(applyTypedEdit(previous, edit)).toEqual({
      value,
      caret,
      notice: 'DECIMAL_DOT',
    })
  })

  it.each<[string, TypedEdit]>([
    ['12,5', typeAt(4, '.')],
    ['12,', typeAt(3, '.')],
    ['12,5', typeAt(2, '.')],
    [',', typeAt(0, '.')],
    ['12,5', replace(3, 4, '.')],
  ])('con una coma en el resto, %j con %j no entra', (previous, edit) => {
    expect(applyTypedEdit(previous, edit)).toEqual({
      value: previous,
      caret: edit.end,
      notice: 'DECIMAL_DOT',
    })
  })

  it('en un número largo sin coma, lo convierte en coma', () => {
    const previous = applyTypedEdit('', typeAt(0, '9'.repeat(30))).value
    expect(applyTypedEdit(previous, typeAt(previous.length, '.'))).toEqual({
      value: previous + ',',
      caret: previous.length + 1,
      notice: 'DECIMAL_DOT',
    })
  })
})

describe('applyTypedEdit: cambios rechazados', () => {
  it.each<[string, TypedEdit]>([
    // Pasting something with a dot that is not a valid number.
    ['', typeAt(0, '12.5')],
    ['', typeAt(0, '1.50')],
    ['', typeAt(0, '0.25')],
    ['12', typeAt(2, '.5')],
    ['12', typeAt(2, '..')],
    ['1', typeAt(1, '.0.')],
    ['12,5', typeAt(4, '.3')],
    ['12', typeAt(2, '.2.')],
    // Select all and paste "1.5" or "12.5": the dot would be lost.
    ['1.500', replace(0, 5, '1.5')],
    ['1.234.567', replace(0, 9, '12.5')],
    // Paste "5.5" over "234.567".
    ['1.234.567', replace(2, 9, '5.5')],
    // Pasting a valid number into a field that is not empty.
    ['5', typeAt(1, '1.234')],
    ['1', typeAt(1, '1.500')],
    // A second comma.
    ['12,5', typeAt(4, ',')],
    ['12,5', typeAt(1, ',')],
    ['12,5', typeAt(0, ',')],
    ['1.234,5', typeAt(3, ',')],
    ['', typeAt(0, '1,2,3')],
    ['', typeAt(0, '1,500.25')],
    // Characters other than ASCII digits, "." and ",".
    ['', typeAt(0, '-')],
    ['', typeAt(0, '+5')],
    ['12', typeAt(2, 'a')],
    ['12', typeAt(2, ' ')],
    ['12', typeAt(1, ' ')],
    ['', typeAt(0, ' 12')],
    ['12', typeAt(2, 'g')],
    ['12', typeAt(2, '%')],
    ['', typeAt(0, '1e3')],
    ['', typeAt(0, ' 12')],
    ['', typeAt(0, '１２')],
    ['', typeAt(0, '١٢')],
    ['1', typeAt(1, '\u0000')],
    ['', typeAt(0, '1 500')],
    ['12', replace(0, 2, '-5')],
  ])('%j con %j', (previous, edit) => {
    expect(applyTypedEdit(previous, edit)).toEqual({
      value: previous,
      caret: edit.end,
      notice: 'REJECTED',
    })
  })

  it.each<[string, TypedEdit]>([
    ['12', typeAt(3, '1')],
    ['12', replace(2, 1, '1')],
    ['12', typeAt(-1, '1')],
    ['12', replace(0, 3, '1')],
    ['12', typeAt(0.5, '1')],
    ['12', typeAt(Number.NaN, '1')],
  ])('un rango inválido: %j con %j', (previous, edit) => {
    expect(applyTypedEdit(previous, edit)).toEqual({
      value: previous,
      caret: previous.length,
      notice: 'REJECTED',
    })
  })
})

describe('applyTypedEdit: tecla por tecla', () => {
  it('"1500,25" pasa por los miles y la coma', () => {
    expect(typeKeys('1500,25').map((s) => [s.value, s.caret])).toEqual([
      ['1', 1],
      ['15', 2],
      ['150', 3],
      ['1.500', 5],
      ['1.500,', 6],
      ['1.500,2', 7],
      ['1.500,25', 8],
    ])
  })

  it('"12.5" termina en "12,5" y avisa en el "."', () => {
    expect(typeKeys('12.5')).toEqual([
      { value: '1', caret: 1, notice: null },
      { value: '12', caret: 2, notice: null },
      { value: '12,', caret: 3, notice: 'DECIMAL_DOT' },
      { value: '12,5', caret: 4, notice: null },
    ])
  })

  it('una segunda coma no entra', () => {
    expect(typeKeys('12,5,3')).toEqual([
      { value: '1', caret: 1, notice: null },
      { value: '12', caret: 2, notice: null },
      { value: '12,', caret: 3, notice: null },
      { value: '12,5', caret: 4, notice: null },
      { value: '12,5', caret: 4, notice: 'REJECTED' },
      { value: '12,53', caret: 5, notice: null },
    ])
  })

  it('"0" seguido de dígitos no deja ceros a la izquierda', () => {
    expect(typeKeys('0012').map((s) => s.value)).toEqual(['0', '0', '1', '12'])
    expect(typeKeys('00,05').map((s) => s.value)).toEqual([
      '0',
      '0',
      '0,',
      '0,0',
      '0,05',
    ])
  })

  it('un número largo se agrupa en cada paso', () => {
    const steps = typeKeys('1234567890')
    expect(steps.at(-1)).toEqual({
      value: '1.234.567.890',
      caret: 13,
      notice: null,
    })
    for (const step of steps) expect(step.value).toMatch(CANONICAL)
  })

  it('borrar desde el final reagrupa y deja el cursor al final', () => {
    let field = '1.234.567,8'
    let caret = field.length
    const shown: [string, number][] = []
    while (field !== '') {
      const step = applyTypedEdit(field, backspace(caret))
      field = step.value
      caret = step.caret
      shown.push([field, caret])
    }
    expect(shown).toEqual([
      ['1.234.567,', 10],
      ['1.234.567', 9],
      ['123.456', 7],
      ['12.345', 6],
      ['1.234', 5],
      ['123', 3],
      ['12', 2],
      ['1', 1],
      ['', 0],
    ])
  })

  it('borrar en el medio deja el cursor en su lugar', () => {
    // Backspace after the first thousands dot: the dot comes back and the
    // caret moves before it; the next backspace deletes the "1".
    let step = applyTypedEdit('1.234.567', backspace(2))
    expect(step).toEqual({ value: '1.234.567', caret: 1, notice: null })
    step = applyTypedEdit(step.value, backspace(step.caret))
    expect(step).toEqual({ value: '234.567', caret: 0, notice: null })
    // Backspace after "1.23": the "3" goes and the caret stays after "2".
    expect(applyTypedEdit('1.234.567', backspace(4))).toEqual({
      value: '124.567',
      caret: 2,
      notice: null,
    })
    // Backspace after the comma.
    expect(applyTypedEdit('1.234,5', backspace(6))).toEqual({
      value: '12.345',
      caret: 5,
      notice: null,
    })
  })

  it('pegar lo que muestra la app en un campo vacío agrega los miles', () => {
    expect(applyTypedEdit('', typeAt(0, formatCarbs(1234.56))).value).toBe(
      '1.234,6',
    )
  })

  it('pegar un número largo y bien agrupado en un campo vacío lo deja igual', () => {
    const text = '1' + '.000'.repeat(100) + ',' + '5'.repeat(100)
    expect(applyTypedEdit('', typeAt(0, text))).toEqual({
      value: text,
      caret: text.length,
      notice: null,
    })
  })

  it('no agrupa ni recorta una parte decimal larga', () => {
    const text = '1,' + '0'.repeat(50)
    expect(applyTypedEdit('1,', typeAt(2, '0'.repeat(50))).value).toBe(text)
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

const PASTES = [
  '1.5',
  '12.5',
  '5.5',
  '.5',
  '1.234',
  '1.234,56',
  '1.000.000',
  '0,25',
  '1,2',
  ',',
  '1,5,',
  '-3',
  ' 1',
  '0012',
]

/** Fields and edits reached by editing at random, from an empty field. */
function generateEdits(count: number, seed: number): [string, TypedEdit][] {
  const random = makeRandom(seed)
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] as T
  const edits: [string, TypedEdit][] = []
  let field = ''
  for (let i = 0; i < count; i++) {
    const start = Math.floor(random() * (field.length + 1))
    const end =
      random() < 0.6
        ? start
        : start + Math.floor(random() * (field.length - start + 1))
    const roll = random()
    const inserted =
      roll < 0.15
        ? ''
        : roll < 0.6
          ? pick([...'0123456789'])
          : roll < 0.72
            ? '.'
            : roll < 0.82
              ? ','
              : pick(PASTES)
    const edit = { start, end, inserted }
    edits.push([field, edit])
    field = applyTypedEdit(field, edit).value
    if (random() < 0.03) field = ''
  }
  return edits
}

const SIGNIFICANT = /[0-9,]/g

describe('applyTypedEdit: propiedades sobre ediciones generadas', () => {
  const edits = generateEdits(20000, 2024)

  it('genera campos variados', () => {
    const fields = edits.map(([previous]) => previous)
    expect(fields.filter((f) => f.includes('.')).length).toBeGreaterThan(1000)
    expect(fields.filter((f) => f.includes(',')).length).toBeGreaterThan(1000)
  })

  it('el campo siempre es canónico y el cursor está dentro', () => {
    for (const [previous, edit] of edits) {
      const { value, caret } = applyTypedEdit(previous, edit)
      const where = JSON.stringify([previous, edit])
      expect(value, where).toMatch(CANONICAL)
      expect(caret, where).toBeGreaterThanOrEqual(0)
      expect(caret, where).toBeLessThanOrEqual(value.length)
    }
  })

  it('si rechaza, deja el texto anterior con el cursor al final del rango', () => {
    for (const [previous, edit] of edits) {
      const result = applyTypedEdit(previous, edit)
      if (result.notice === 'REJECTED') {
        expect(result, JSON.stringify([previous, edit])).toEqual({
          value: previous,
          caret: edit.end,
          notice: 'REJECTED',
        })
      }
    }
  })

  it('un "." que entra nunca desaparece sin aviso', () => {
    let withDot = 0
    for (const [previous, edit] of edits) {
      if (!edit.inserted.includes('.')) continue
      const remaining = previous.slice(0, edit.start) + previous.slice(edit.end)
      const { value, notice } = applyTypedEdit(previous, edit)
      const where = JSON.stringify([previous, edit])
      if (remaining.trim() === '' && parseUserNumber(edit.inserted) !== null) {
        expect(notice, where).toBeNull()
        continue
      }
      withDot++
      expect(notice, where).not.toBeNull()
      if (value !== previous) {
        expect(notice, where).toBe('DECIMAL_DOT')
        expect(remaining.includes(','), where).toBe(false)
        expect(value.split(',').length - 1, where).toBe(1)
      }
    }
    expect(withDot).toBeGreaterThan(1000)
  })

  it('sin aviso, el campo tiene los dígitos del resto con lo insertado', () => {
    for (const [previous, edit] of edits) {
      const { value, notice } = applyTypedEdit(previous, edit)
      if (notice !== null) continue
      const text =
        previous.slice(0, edit.start) + edit.inserted + previous.slice(edit.end)
      expect(value.replaceAll('.', ''), JSON.stringify([previous, edit])).toBe(
        text.replaceAll('.', '').replace(/^0+(?=\d)/, ''),
      )
    }
  })

  it('antes del cursor quedan los dígitos y comas esperados', () => {
    for (const [previous, edit] of edits) {
      const { value, caret, notice } = applyTypedEdit(previous, edit)
      const remaining = previous.slice(0, edit.start) + previous.slice(edit.end)
      if (notice === 'REJECTED') continue
      if (notice === 'DECIMAL_DOT' && remaining.includes(',')) continue
      const typed = notice === 'DECIMAL_DOT' ? ',' : edit.inserted
      const left = (previous.slice(0, edit.start) + typed).replaceAll('.', '')
      const all = (left + previous.slice(edit.end)).replaceAll('.', '')
      const droppedZeros = /^0+(?=\d)/.exec(all)?.[0].length ?? 0
      const expected = left.slice(Math.min(droppedZeros, left.length))
      const where = JSON.stringify([previous, edit])
      expect(value.slice(0, caret).replaceAll('.', ''), where).toBe(expected)
      // The caret never sits right after a thousands dot.
      if (caret > 0) expect(value[caret - 1], where).not.toBe('.')
      expect(value.slice(0, caret).match(SIGNIFICANT)?.length ?? 0).toBe(
        expected.length,
      )
    }
  })
})

describe('applyTypedEdit: coma sobre una selección que incluye la coma', () => {
  it.each<Case>([
    // The replaced range had the comma, so the rest has none: it goes in.
    ['12,5', replace(2, 3, ','), '12,5', 3],
    ['12,5', replace(2, 4, ','), '12,', 3],
    ['1.234,5', replace(3, 6, ','), '12,5', 3],
    ['1.234,56', replace(5, 6, ','), '1.234,56', 6],
    ['1.234,56', replace(1, 6, '9,'), '19,56', 3],
    ['1,5', replace(0, 3, '2,7'), '2,7', 3],
    ['12,5', replace(1, 4, '3,4'), '13,4', 4],
  ])('%j con %j → %j, cursor en %i', (previous, edit, value, caret) => {
    expect(applyTypedEdit(previous, edit)).toEqual({
      value,
      caret,
      notice: null,
    })
  })
})

describe('applyTypedEdit: tipear un dígito y borrarlo', () => {
  it('backspace en el cursor deja el texto anterior', () => {
    for (const previous of ['1', '12', '1.234', '12.345,6', '9.999', '1,5']) {
      for (let at = 1; at <= previous.length; at++) {
        if (previous[at - 1] === '.') continue
        const typed = applyTypedEdit(previous, typeAt(at, '7'))
        const back = applyTypedEdit(typed.value, backspace(typed.caret))
        expect(back.value, JSON.stringify([previous, at])).toBe(previous)
      }
    }
  })
})
