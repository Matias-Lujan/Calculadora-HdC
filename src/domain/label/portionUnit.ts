/** "1 alfajor", "1 unidad (50 g)": one unit, named with a single word. */
const SINGLE_UNIT = /^1\s+(\p{L}+)\s*(?:\(.*\))?$/u

/**
 * The name of the unit when the portion of a label is exactly one unit
 * ("1 alfajor" → "alfajor", "1 unidad (50 g)" → "unidad"), so the portion
 * can be offered as the weight per unit (spec §6.1). null for anything
 * else ("2 galletitas", "1/2 taza", "30 g", "1 taza grande").
 */
export function singleUnitLabel(description: string): string | null {
  const match = SINGLE_UNIT.exec(description.trim())
  return match?.[1] ?? null
}
