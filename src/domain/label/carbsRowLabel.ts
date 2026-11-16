/**
 * The usual names of the carbohydrate row in the Mercosur format, already
 * normalized (see normalize). In that format the carbs exclude the fiber
 * (spec §5.3).
 */
const MERCOSUR_LABELS = new Set([
  'carbohidratos',
  'hidratos de carbono',
  'carbohidratos disponibles',
  'hidratos de carbono disponibles',
])

/**
 * A unit or punctuation at the end: "(g)", " g", ":" or ".". Also the
 * "de los cuales" (with or without a comma before it) of the new Argentine
 * format, where the row reads "Carbohidratos, de los cuales:" and is followed
 * by the sugars.
 */
const TRAILING = /(?:\s*\(g\)|\s+g|\s*[:.]|\s*,?\s*\bde los cuales)$/

function normalize(text: string): string {
  let result = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  // "Carbohidratos (g):" ends with two of them.
  let previous = ''
  while (previous !== result) {
    previous = result
    result = result.replace(TRAILING, '').trim()
  }
  return result
}

/**
 * Whether the printed name of the carbohydrate row is one of the usual
 * Mercosur ones ("Carbohidratos", "Hidratos de carbono", with or without
 * "disponibles"), ignoring case, accents, extra spaces and a "(g)", "g", ":",
 * "." or ", de los cuales" at the end. Anything else ("Total Carbohydrate", "Carbohidratos
 * totales") is not: the carbs may include the fiber (spec §5.3).
 */
export function isMercosurCarbsLabel(text: string): boolean {
  return MERCOSUR_LABELS.has(normalize(text))
}
