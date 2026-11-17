import { z } from 'zod'
import { needsCookingFactor } from '../../domain/dose/index.ts'
import { foodSchema, type Food } from '../../lib/foods.ts'
import { canUseUnits, newItemDraft } from './mealDraft.ts'
import type { MealFood, MealItemDraft } from './types.ts'

// The meal being entered, kept while the app is open (spec §6.6, §14 #61):
// what is stored, how it is read back, and the food that comes back from
// "Agregar con una foto". Only what the user entered is stored; the
// calculation and the breakdown are derived again in the render.

/** What is stored: the items (with their copy of the food), as typed. */
export type StoredMealDraft = {
  items: MealItemDraft[]
  /** null: the applied dose follows the calculated one (spec §14 #46). */
  appliedDoseText: string | null
  /** null: "Ahora". */
  eatenAtText: string | null
}

const mealFoodSchema = foodSchema.extend({
  id: z.string().nullable(),
}) satisfies z.ZodType<MealFood>

const storedItemSchema = z
  .object({
    key: z.number().int().nonnegative(),
    food: mealFoodSchema,
    quantityMode: z.enum(['grams', 'units']),
    quantityText: z.string(),
  })
  // Units only where the form offers them (spec §6.6).
  .refine((item) => item.quantityMode === 'grams' || canUseUnits(item.food))
  // A food not copied yet can only be one of the reference table, which
  // saving copies by its code (spec §6.2).
  .refine(
    ({ food }) =>
      food.id !== null ||
      (food.source === 'reference' &&
        food.reference_db === 'usda_fdc' &&
        food.reference_code !== null &&
        food.state === 'as_eaten'),
  ) satisfies z.ZodType<MealItemDraft>

const storedMealDraftSchema = z
  .object({
    items: z.array(storedItemSchema).min(1),
    appliedDoseText: z.string().nullable(),
    eatenAtText: z.string().nullable(),
  })
  .refine(
    ({ items }) => new Set(items.map((item) => item.key)).size === items.length,
  ) satisfies z.ZodType<StoredMealDraft>

/**
 * The stored draft (it enters as `unknown`), or null if there is none or it
 * is not valid: then Inicio starts empty, without an error. A draft without
 * items is not stored, so it is not valid either.
 */
export function parseStoredMealDraft(value: unknown): StoredMealDraft | null {
  const parsed = storedMealDraftSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** The key of the next item: one more than the biggest one. */
export function nextItemKey(items: readonly MealItemDraft[]): number {
  return items.reduce((next, item) => Math.max(next, item.key + 1), 0)
}

/** How the meal form starts. */
export type InitialMealForm = StoredMealDraft & {
  /** The key the next picked item gets. */
  nextKey: number
  /** The item added from the photo, whose quantity gets the focus. */
  focusKey: number | null
  /**
   * A food saved from the photo that cannot be used yet (cooked, without how
   * much it yields): it is not added and Inicio says why.
   */
  notUsableFood: Pick<Food, 'id' | 'name'> | null
}

/**
 * The meal form when Inicio opens: the stored draft (or an empty meal) and,
 * if the photo screen sent a food back, that food as a new item at the end,
 * as if it had been picked in the search. A food that still needs how much
 * it yields is not added (spec §6.4).
 */
export function initialMealForm(
  stored: StoredMealDraft | null,
  addedFood: Food | null,
): InitialMealForm {
  const draft = stored ?? {
    items: [],
    appliedDoseText: null,
    eatenAtText: null,
  }
  const nextKey = nextItemKey(draft.items)
  if (addedFood === null) {
    return { ...draft, nextKey, focusKey: null, notUsableFood: null }
  }
  if (needsCookingFactor(addedFood.state, addedFood.cooking_factor)) {
    return {
      ...draft,
      nextKey,
      focusKey: null,
      notUsableFood: { id: addedFood.id, name: addedFood.name },
    }
  }
  return {
    ...draft,
    items: [...draft.items, newItemDraft(nextKey, addedFood)],
    nextKey: nextKey + 1,
    focusKey: nextKey,
    notUsableFood: null,
  }
}
