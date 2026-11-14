import type { QuantityMode } from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'

/**
 * One item of the meal being entered, as the form holds it.
 * - `key`: stable id of the item in the form (React key and field id). Its
 *   position in the meal is its index in the list.
 * - `food`: a copy of the food row taken when it was picked. Editing or
 *   archiving the food afterwards does not change the item, so what is
 *   saved is what was shown.
 * - `quantityText`: the quantity field, as typed (spec §8.7).
 */
export type MealItemDraft = {
  key: number
  food: Food
  quantityMode: QuantityMode
  quantityText: string
}
