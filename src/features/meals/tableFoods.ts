import type { Food } from '../../lib/foods.ts'
import { searchFoods } from '../../lib/search.ts'
import type { MealFood, NewTableFood, ReferenceFood } from './types.ts'

// The reference table in the meal screen (spec §6.2, §6.6, §14 #51): its
// foods are picked directly, and copied to the catalog only when the meal
// is saved (createMeal).

/** The ⓘ of an item whose food came from the reference table (spec §5.1). */
export const TABLE_VALUE_INFO =
  'Es el valor promedio de una tabla de alimentos. En lo que se cocina, como el arroz o los fideos, depende de cuánta agua absorbió: para más precisión, cargá el paquete en el catálogo y pesalo crudo y cocido.'

/**
 * A reference table food as a food of the meal, not copied yet (`id`
 * null). The values are copied as they are, without rounding.
 */
export function tableFoodAsMealFood(ref: ReferenceFood): MealFood {
  return {
    id: null,
    name: ref.name_es,
    brand: null,
    source: 'reference',
    state: ref.state,
    carbs_per_100g: ref.carbs_per_100g,
    cooking_factor: null,
    unit_weight_g: null,
    unit_label: null,
    reference_db: 'usda_fdc',
    reference_code: ref.reference_code,
    reference_description: ref.description_original,
    notes: null,
    archived_at: null,
  }
}

/**
 * Whether a food came from the reference table: picked from it, or its
 * copy in the catalog. ARGENFOODS foods were typed by the user, so they
 * do not count.
 */
export function isFromTable(
  food: Pick<MealFood, 'source' | 'reference_db'>,
): boolean {
  return food.source === 'reference' && food.reference_db === 'usda_fdc'
}

/**
 * The results of the meal food search: first the catalog, then the
 * reference table, each sorted by searchFoods. An empty query (or only
 * spaces) gives nothing. A table food is left out if its copy is among the
 * catalog results, so the same food is not shown twice; a food with the
 * same name that is not its copy does not hide it.
 */
export function pickerResults(
  foods: readonly Food[],
  tableFoods: readonly MealFood[],
  query: string,
): { catalog: Food[]; table: MealFood[] } {
  if (query.trim() === '') return { catalog: [], table: [] }
  const catalog = searchFoods(foods, query)
  const copied = new Set(
    catalog
      .filter((food) => isFromTable(food) && food.reference_code !== null)
      .map((food) => food.reference_code),
  )
  const table = searchFoods(
    tableFoods.filter((food) => !copied.has(food.reference_code)),
    query,
  )
  return { catalog, table }
}

/**
 * The copy of a reference table food that createMeal looks for or inserts
 * (spec §6.2): named as in the table, without brand.
 */
export function tableFoodCopy(food: MealFood): NewTableFood {
  if (food.reference_code === null) {
    throw new Error('A reference table food has no code')
  }
  return {
    name: food.name,
    brand: null,
    source: 'reference',
    state: food.state,
    carbs_per_100g: food.carbs_per_100g,
    reference_db: 'usda_fdc',
    reference_code: food.reference_code,
    reference_description: food.reference_description,
  }
}
