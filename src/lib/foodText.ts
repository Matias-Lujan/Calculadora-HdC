import { cookedGramsPer100gRaw, formatGrams } from '../domain/dose/index.ts'
import type { Food } from './foods.ts'

// Texts about a food shared by the catalog (features/foods) and the meal
// screen (features/meals): a feature does not import another feature's
// internals (CLAUDE.md). Kept apart from foods.ts, which imports the
// Supabase client, so pure modules and their tests can use them.

/**
 * How much 100 g raw yield cooked, "100 g crudo rinden 260 g cocido" (spec
 * §6.4), with the grams formatted by formatGrams. Only for display. null
 * when the factor is not valid or its yield overflows.
 */
export function cookedPer100gText(factor: number): string | null {
  const grams = cookedGramsPer100gRaw(factor)
  if (grams === null) return null
  return `100 g crudo rinden ${formatGrams(grams)} g cocido`
}

/** The ⓘ of a food that came from the reference table (spec §5.1). */
export const TABLE_VALUE_INFO =
  'Es un valor promedio de una tabla de alimentos.'

/**
 * Whether a food came from the reference table: picked from it, or its
 * copy in the catalog. ARGENFOODS foods were typed by the user, so they
 * do not count.
 */
export function isFromTable(
  food: Pick<Food, 'source' | 'reference_db'>,
): boolean {
  return food.source === 'reference' && food.reference_db === 'usda_fdc'
}
