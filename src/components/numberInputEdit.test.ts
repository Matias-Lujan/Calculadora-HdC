import { describe, expect, it } from 'vitest'
import { applyTypedEdit } from '../domain/dose/index.ts'
import {
  beforeInputAction,
  deletionEdit,
  pasteEdit,
} from './numberInputEdit.ts'

const at = (start: number, end = start) => ({
  selectionStart: start,
  selectionEnd: end,
})

describe('beforeInputAction', () => {
  it.each(['insertText', 'insertFromDictation', 'insertFromPaste'])(
    '%s with data and a selection → apply',
    (inputType) => {
      expect(beforeInputAction({ inputType, data: '5', ...at(2) })).toEqual({
        kind: 'apply',
        edit: { start: 2, end: 2, inserted: '5' },
      })
    },
  )

  it('replaces a non-collapsed selection', () => {
    expect(
      beforeInputAction({ inputType: 'insertText', data: '7', ...at(1, 4) }),
    ).toEqual({ kind: 'apply', edit: { start: 1, end: 4, inserted: '7' } })
  })

  it('keeps dictated text as is', () => {
    expect(
      beforeInputAction({
        inputType: 'insertFromDictation',
        data: '12,5',
        ...at(0),
      }),
    ).toEqual({ kind: 'apply', edit: { start: 0, end: 0, inserted: '12,5' } })
  })

  it.each(['insertText', 'insertFromDictation', 'insertFromPaste'])(
    '%s without data → reject',
    (inputType) => {
      expect(beforeInputAction({ inputType, data: null, ...at(0) })).toEqual({
        kind: 'reject',
      })
    },
  )

  it.each([
    [null, 0],
    [0, null],
    [null, null],
  ])('insertText with selection (%s, %s) → reject', (start, end) => {
    expect(
      beforeInputAction({
        inputType: 'insertText',
        data: '5',
        selectionStart: start,
        selectionEnd: end,
      }),
    ).toEqual({ kind: 'reject' })
  })

  it.each([
    'insertReplacementText',
    'insertFromDrop',
    'insertFromYank',
    'insertTranspose',
  ])('%s → reject (unknown range)', (inputType) => {
    expect(beforeInputAction({ inputType, data: '5', ...at(0) })).toEqual({
      kind: 'reject',
    })
  })

  it.each([
    'deleteContentBackward',
    'deleteContentForward',
    'deleteWordBackward',
    'deleteWordForward',
    'deleteSoftLineBackward',
    'deleteHardLineBackward',
    'deleteByCut',
    'deleteByDrag',
  ])('%s → native', (inputType) => {
    expect(beforeInputAction({ inputType, data: null, ...at(3) })).toEqual({
      kind: 'native',
    })
  })

  it.each([
    'historyUndo',
    'historyRedo',
    'insertLineBreak',
    'insertParagraph',
    'formatBold',
    'formatItalic',
    'insertCompositionText',
    'foo',
    '',
  ])('%j → ignore', (inputType) => {
    expect(beforeInputAction({ inputType, data: '5', ...at(0) })).toEqual({
      kind: 'ignore',
    })
  })
})

describe('pasteEdit', () => {
  it('returns null for an empty text', () => {
    expect(pasteEdit('', 0, 0)).toBeNull()
  })

  it.each([
    [null, 0],
    [0, null],
    [null, null],
  ])('returns null for selection (%s, %s)', (start, end) => {
    expect(pasteEdit('12', start, end)).toBeNull()
  })

  it('replaces the selection with the text, without trimming it', () => {
    expect(pasteEdit(' 1.234,5 ', 1, 3)).toEqual({
      start: 1,
      end: 3,
      inserted: ' 1.234,5 ',
    })
  })

  it('inserts at a collapsed caret', () => {
    expect(pasteEdit('5', 2, 2)).toEqual({ start: 2, end: 2, inserted: '5' })
  })
})

describe('deletionEdit', () => {
  it('backspace at the end of "1.500"', () => {
    expect(deletionEdit('1.500', '1.50', 4)).toEqual({
      start: 4,
      end: 5,
      inserted: '',
    })
  })

  it('forward delete in the middle equals the matching backspace', () => {
    // Forward delete with the caret before the "5" and backspace with the
    // caret after it both leave "1.00" with the caret at 2.
    expect(deletionEdit('1.500', '1.00', 2)).toEqual({
      start: 2,
      end: 3,
      inserted: '',
    })
    // Same for the first "0": both leave the caret at 3.
    expect(deletionEdit('1.500', '1.50', 3)).toEqual({
      start: 3,
      end: 4,
      inserted: '',
    })
  })

  it('a deleted selection', () => {
    expect(deletionEdit('1.500', '00', 0)).toEqual({
      start: 0,
      end: 3,
      inserted: '',
    })
  })

  it('deleting everything', () => {
    expect(deletionEdit('1.500', '', 0)).toEqual({
      start: 0,
      end: 5,
      inserted: '',
    })
  })

  it.each([
    ['1.500', '1.500'],
    ['1.50', '1.500'],
    ['1.500', '1.509'],
  ])('%j → %j is not a deletion', (previous, next) => {
    expect(deletionEdit(previous, next, 2)).toBeNull()
  })

  it('an incoherent result is not a deletion', () => {
    expect(deletionEdit('1.500', '1.09', 3)).toBeNull()
    expect(deletionEdit('1.500', '1.09', 4)).toBeNull()
  })

  it('a caret that does not match the deleted range', () => {
    // "1.500" → "1.00" deletes the "5" (index 2), not what is at 0.
    expect(deletionEdit('1.500', '1.00', 0)).toBeNull()
  })

  it.each([null, -1, 5, 6, 1.5])('caret %s → null', (caret) => {
    expect(deletionEdit('1.500', '1.50', caret)).toBeNull()
  })
})

describe('deletion through applyTypedEdit', () => {
  it('backspace at the end of "15.000" gives "1.500"', () => {
    const edit = deletionEdit('15.000', '15.00', 5)
    expect(edit).toEqual({ start: 5, end: 6, inserted: '' })
    if (edit === null) return
    expect(applyTypedEdit('15.000', edit)).toEqual({
      value: '1.500',
      caret: 5,
      notice: null,
    })
  })

  it('backspace right after a thousands dot keeps the text', () => {
    const edit = deletionEdit('1.500', '1500', 1)
    expect(edit).toEqual({ start: 1, end: 2, inserted: '' })
    if (edit === null) return
    expect(applyTypedEdit('1.500', edit)).toEqual({
      value: '1.500',
      caret: 1,
      notice: null,
    })
  })

  it('deleting a selected thousands group regroups', () => {
    // "1.234.567" with "234." selected and deleted.
    const edit = deletionEdit('1.234.567', '1.567', 2)
    expect(edit).toEqual({ start: 2, end: 6, inserted: '' })
    if (edit === null) return
    expect(applyTypedEdit('1.234.567', edit).value).toBe('1.567')
  })
})

describe('beforeInputAction, edge cases', () => {
  it('apply keeps the order start/end and an empty data string', () => {
    expect(
      beforeInputAction({ inputType: 'insertText', data: '', ...at(0, 2) }),
    ).toEqual({ kind: 'apply', edit: { start: 0, end: 2, inserted: '' } })
  })

  it('insertFromDictation with several words goes to applyTypedEdit as is', () => {
    expect(
      beforeInputAction({
        inputType: 'insertFromDictation',
        data: 'doce coma cinco',
        ...at(0),
      }),
    ).toEqual({
      kind: 'apply',
      edit: { start: 0, end: 0, inserted: 'doce coma cinco' },
    })
  })

  it.each(['insertReplacementText', 'insertFromDrop'])(
    '%s without data or selection is still reject',
    (inputType) => {
      expect(
        beforeInputAction({
          inputType,
          data: null,
          selectionStart: null,
          selectionEnd: null,
        }),
      ).toEqual({ kind: 'reject' })
    },
  )

  it.each(['deleteContent', 'deleteEntireSoftLine', 'deleteSoftLineForward'])(
    '%s → native',
    (inputType) => {
      expect(
        beforeInputAction({
          inputType,
          data: null,
          selectionStart: null,
          selectionEnd: null,
        }),
      ).toEqual({ kind: 'native' })
    },
  )

  it.each(['InsertText', 'DeleteContentBackward', 'insertTextX', 'xdelete'])(
    'is case and name sensitive: %j → ignore',
    (inputType) => {
      expect(beforeInputAction({ inputType, data: '5', ...at(0) })).toEqual({
        kind: 'ignore',
      })
    },
  )

  it('insertFromPasteAsQuotation is ignored, not applied', () => {
    expect(
      beforeInputAction({
        inputType: 'insertFromPasteAsQuotation',
        data: '5',
        ...at(0),
      }),
    ).toEqual({ kind: 'ignore' })
  })
})

describe('pasteEdit, edge cases', () => {
  it('a single space is pasted as is (applyTypedEdit rejects it)', () => {
    const edit = pasteEdit(' ', 0, 0)
    expect(edit).toEqual({ start: 0, end: 0, inserted: ' ' })
    if (edit === null) return
    expect(applyTypedEdit('12', edit).notice).toBe('REJECTED')
  })

  it('selection 0..0 is a valid selection, not a missing one', () => {
    expect(pasteEdit('1', 0, 0)).not.toBeNull()
  })
})

describe('deletionEdit, edge cases', () => {
  it('backspace on the first character (caret ends at 0)', () => {
    expect(deletionEdit('1.500', '.500', 0)).toEqual({
      start: 0,
      end: 1,
      inserted: '',
    })
  })

  it('deleting the last characters (range ends exactly at the end)', () => {
    expect(deletionEdit('1.500', '1.5', 3)).toEqual({
      start: 3,
      end: 5,
      inserted: '',
    })
  })

  it('caret at the end with something deleted → null', () => {
    expect(deletionEdit('1.500', '1.50', 5)).toBeNull()
  })

  it('caret one past the last valid start → null', () => {
    // L = 2, so the last valid start is 3.
    expect(deletionEdit('1.500', '1.5', 4)).toBeNull()
  })

  it.each([NaN, Infinity, -Infinity, -0.5])('caret %s → null', (caret) => {
    expect(deletionEdit('1.500', '1.50', caret)).toBeNull()
  })

  it('a negative caret is rejected even when slice() would make it fit', () => {
    // slice(0, -2) + slice(-1) of "1.500" is "1.5" + "0" = "1.50".
    expect(deletionEdit('1.500', '1.50', -2)).toBeNull()
  })

  it('a fractional caret is rejected even when slice() would make it fit', () => {
    // slice() truncates 0.5 to 0: slice(0, 0.5) + slice(1.5) = ".500".
    expect(deletionEdit('1.500', '.500', 0.5)).toBeNull()
  })

  it('empty previous → null', () => {
    expect(deletionEdit('', '', 0)).toBeNull()
  })

  it('a same-length replacement is not a deletion', () => {
    expect(deletionEdit('12', '13', 1)).toBeNull()
  })

  it('a shorter text that is not a contiguous deletion → null', () => {
    // "1.500" → "150": two separate characters went away (the dot and a 0).
    expect(deletionEdit('1.500', '150', 1)).toBeNull()
    expect(deletionEdit('1.500', '150', 2)).toBeNull()
  })

  it('in "1.000", every coherent caret deleting a "0" gives the same value', () => {
    const results = [2, 3, 4].map((caret) => {
      const edit = deletionEdit('1.000', '1.00', caret)
      expect(edit, `caret ${caret}`).toEqual({
        start: caret,
        end: caret + 1,
        inserted: '',
      })
      if (edit === null) throw new Error('unreachable')
      return applyTypedEdit('1.000', edit)
    })
    expect(results.map((result) => result.value)).toEqual(['100', '100', '100'])
    // The caret follows where the browser left it: after "1", "10" and "100".
    expect(results.map((result) => result.caret)).toEqual([1, 2, 3])
    expect(results.every((result) => result.notice === null)).toBe(true)
  })

  it('in "1.001", deleting either middle "0" gives the same value', () => {
    for (const caret of [2, 3]) {
      const edit = deletionEdit('1.001', '1.01', caret)
      if (edit === null) throw new Error(`caret ${caret} gave null`)
      expect(applyTypedEdit('1.001', edit).value).toBe('101')
    }
    // Caret 4 would mean deleting the "1": the result would be "1.00".
    expect(deletionEdit('1.001', '1.01', 4)).toBeNull()
  })

  it('the coherent ranges never change the value applyTypedEdit gives', () => {
    // Two coherent carets leave the same `next`, so the rest is the same.
    const random = seeded(42)
    const alphabet = '0123456789.,'
    for (let i = 0; i < 3000; i++) {
      const length = 1 + Math.floor(random() * 10)
      let previous = ''
      for (let j = 0; j < length; j++) {
        previous += alphabet[Math.floor(random() * alphabet.length)]
      }
      const start = Math.floor(random() * previous.length)
      const end = start + 1 + Math.floor(random() * (previous.length - start))
      const next = previous.slice(0, start) + previous.slice(end)
      const values = new Set<string>()
      let found = false
      for (let caret = 0; caret <= previous.length; caret++) {
        const edit = deletionEdit(previous, next, caret)
        if (edit === null) continue
        if (caret === start) found = true
        expect(edit.end - edit.start).toBe(end - start)
        values.add(applyTypedEdit(previous, edit).value)
      }
      expect(found, `${previous} [${start},${end})`).toBe(true)
      expect(values.size, `${previous} → ${next}`).toBe(1)
    }
  })
})

/** Small deterministic PRNG (mulberry32), so generated cases are reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
