import { describe, expect, it } from 'vitest'
import { appliedDoseShortcuts } from './appliedDoseShortcuts.ts'

describe('appliedDoseShortcuts', () => {
  it.each([
    // Not whole: the whole unit below, the half and the whole unit above.
    [8.55, [8, 8.5, 9], true],
    [8.546666666666667, [8, 8.5, 9], true],
    [8.25, [8, 8.5, 9], true],
    [8.75, [8, 8.5, 9], true],
    [0.3, [0, 0.5, 1], true],
    [0.01, [0, 0.5, 1], true],
    [1.2, [1, 1.5, 2], true],
    [12.04, [12, 12.5, 13], true],
    // Whole: half a unit below and above.
    [8, [7.5, 8, 8.5], false],
    [1, [0.5, 1, 1.5], false],
    [100, [99.5, 100, 100.5], false],
  ])('%s → %o (calculated shown: %s)', (dose, penUnits, showCalculated) => {
    expect(appliedDoseShortcuts(dose)).toEqual({ penUnits, showCalculated })
  })

  it('a dose of 0 has no negative shortcut', () => {
    expect(appliedDoseShortcuts(0)).toEqual({
      penUnits: [0, 0.5],
      showCalculated: false,
    })
  })

  it('a dose of -0 is the same as 0, never "-0"', () => {
    const shortcuts = appliedDoseShortcuts(-0)
    expect(shortcuts).toEqual({ penUnits: [0, 0.5], showCalculated: false })
    expect(Object.is(shortcuts.penUnits[0], 0)).toBe(true)
  })

  it('a dose of 0,5 (a pen value) does not repeat itself', () => {
    expect(appliedDoseShortcuts(0.5)).toEqual({
      penUnits: [0, 0.5, 1],
      showCalculated: false,
    })
  })

  it('8,5 is one of the shortcuts: the calculated one is not repeated', () => {
    expect(appliedDoseShortcuts(8.5)).toEqual({
      penUnits: [8, 8.5, 9],
      showCalculated: false,
    })
  })

  it('8,999 is shown as "9": the calculated one is not repeated', () => {
    expect(appliedDoseShortcuts(8.999)).toEqual({
      penUnits: [8, 8.5, 9],
      showCalculated: false,
    })
  })

  it('8,995 rounds half up to "9" when shown: the calculated one is not repeated', () => {
    // 8.995 is stored as 8.99499…; formatDoseCompact rounds it in decimal.
    expect(appliedDoseShortcuts(8.995)).toEqual({
      penUnits: [8, 8.5, 9],
      showCalculated: false,
    })
  })

  it('a dose just under a half that is shown as the half is not repeated', () => {
    // 7.4999 is shown as "7,5", like the shortcut 7,5.
    expect(appliedDoseShortcuts(7.4999)).toEqual({
      penUnits: [7, 7.5, 8],
      showCalculated: false,
    })
    // 7.494 is shown as "7,49": offered.
    expect(appliedDoseShortcuts(7.494).showCalculated).toBe(true)
  })

  it('9,0001 is not whole, and is shown as "9"', () => {
    expect(appliedDoseShortcuts(9.0001)).toEqual({
      penUnits: [9, 9.5, 10],
      showCalculated: false,
    })
  })

  it('8,994 is shown as "8,99": the calculated one is offered', () => {
    expect(appliedDoseShortcuts(8.994)).toEqual({
      penUnits: [8, 8.5, 9],
      showCalculated: true,
    })
  })

  it('0,004 is shown as "0", like the shortcut 0', () => {
    expect(appliedDoseShortcuts(0.004)).toEqual({
      penUnits: [0, 0.5, 1],
      showCalculated: false,
    })
  })

  it('8,495 rounds to "8,5" when shown: the calculated one is not repeated', () => {
    // formatDoseCompact rounds half up in decimal: 8.495 → "8,5".
    expect(appliedDoseShortcuts(8.495).showCalculated).toBe(false)
  })

  it('a huge whole dose has no room for halves: a single shortcut', () => {
    expect(appliedDoseShortcuts(1e20)).toEqual({
      penUnits: [1e20],
      showCalculated: false,
    })
    expect(appliedDoseShortcuts(Number.MAX_VALUE)).toEqual({
      penUnits: [Number.MAX_VALUE],
      showCalculated: false,
    })
  })

  it('the shortcuts are in order and without repeats', () => {
    for (const dose of [0, 0.3, 0.5, 1, 2.5, 7.99, 8, 8.55, 1e15, 1e20]) {
      const { penUnits } = appliedDoseShortcuts(dose)
      expect(new Set(penUnits).size).toBe(penUnits.length)
      expect([...penUnits].sort((a, b) => a - b)).toEqual(penUnits)
      expect(penUnits.every((value) => value >= 0)).toBe(true)
    }
  })

  it.each([NaN, Infinity, -Infinity, -0.5, -8])(
    'a dose of %s is not valid → no shortcuts',
    (dose) => {
      expect(appliedDoseShortcuts(dose)).toEqual({
        penUnits: [],
        showCalculated: false,
      })
    },
  )
})
