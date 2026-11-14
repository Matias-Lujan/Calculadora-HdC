/** Lowercase and without diacritics: "Café" → "cafe", "Piña" → "pina". */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

const collator = new Intl.Collator('es', { sensitivity: 'base' })

function compareFoods(
  a: { name: string; brand: string | null },
  b: { name: string; brand: string | null },
): number {
  const byName = collator.compare(a.name, b.name)
  if (byName !== 0) return byName
  if (a.brand === b.brand) return 0
  if (a.brand === null) return -1
  if (b.brand === null) return 1
  return collator.compare(a.brand, b.brand)
}

/**
 * Filters the catalog in the client (spec §6.5): every word of the query
 * has to appear in the name or in the brand, in any order, ignoring case
 * and diacritics. Words are matched as literal text (no regex). The result
 * is sorted by name and then brand (no brand first). An empty query returns
 * every food, sorted. The input is not mutated.
 */
export function searchFoods<T extends { name: string; brand: string | null }>(
  foods: readonly T[],
  query: string,
): T[] {
  const terms = normalizeForSearch(query)
    .split(/\s+/)
    .filter((term) => term !== '')
  // The newline keeps a word from matching across name and brand.
  const matches =
    terms.length === 0
      ? foods
      : foods.filter((food) => {
          const haystack = normalizeForSearch(
            `${food.name}\n${food.brand ?? ''}`,
          )
          return terms.every((term) => haystack.includes(term))
        })
  return matches.toSorted(compareFoods)
}
