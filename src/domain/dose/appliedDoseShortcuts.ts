import { formatDoseCompact } from './format.ts'

/** The shortcuts offered under the applied dose of a meal (spec §6.6). */
export type AppliedDoseShortcuts = {
  /**
   * Pen values around the calculated dose, in order and without repeats:
   * `floor(d)`, `floor(d) + 0.5` and `floor(d) + 1` if `d` is not whole;
   * `d - 0.5`, `d` and `d + 0.5` if it is, without negatives.
   */
  penUnits: number[]
  /**
   * Whether to offer the calculated dose as one more shortcut: only if none
   * of the pen values looks the same once shown without trailing zeros
   * (8 for a dose of 8, 9 for 8.999).
   */
  showCalculated: boolean
}

const NONE: AppliedDoseShortcuts = { penUnits: [], showCalculated: false }

/**
 * Pen values to suggest for the applied dose, around the calculated dose
 * `doseUnits` (spec §6.6, §14 #71). They only suggest: the app never picks
 * one, and the dose is not rounded anywhere else. A pen marks whole or half
 * units, so the values are the whole unit below, the half and the whole
 * unit above (8.55 gives 8, 8.5 and 9); a whole dose gives half a unit
 * below and above (8 gives 7.5, 8 and 8.5; 0 gives 0 and 0.5).
 *
 * A dose that is not a finite number >= 0 gives no shortcuts.
 */
export function appliedDoseShortcuts(doseUnits: number): AppliedDoseShortcuts {
  if (!Number.isFinite(doseUnits) || doseUnits < 0) return NONE
  // -0 + 0 is 0: a dose of -0 gives the same shortcuts as 0.
  const dose = doseUnits + 0
  const floor = Math.floor(dose)
  const candidates = Number.isInteger(dose)
    ? [dose - 0.5, dose, dose + 0.5]
    : [floor, floor + 0.5, floor + 1]
  const penUnits: number[] = []
  for (const value of candidates) {
    // A huge dose has no room for halves: dose ± 0.5 is the dose itself.
    if (value >= 0 && !penUnits.includes(value)) penUnits.push(value)
  }
  const calculatedText = formatDoseCompact(dose)
  const showCalculated = !penUnits.some(
    (value) => formatDoseCompact(value) === calculatedText,
  )
  return { penUnits, showCalculated }
}
