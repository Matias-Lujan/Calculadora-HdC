import { z } from 'zod'
import { needsCookingFactor } from '../../domain/dose/index.ts'
import { foodSchema, type Food } from '../../lib/foods.ts'
import {
  copiedMeal,
  type CorrectedMeal,
  type MealCopyRequest,
  type SkippedItem,
} from './mealCopy.ts'
import { canUseUnits, newItemDraft } from './mealDraft.ts'
import type { MealFood, MealItemDraft } from './types.ts'

// The meal being entered, kept while the app is open (spec §6.6, §14 #61):
// what is stored, how it is read back, the food that comes back from
// "Con foto" (or "Agregar a mano") and a saved meal loaded with "Repetir"
// or "Corregir". Only what the user entered is stored; the calculation and
// the breakdown are derived again in the render.

/** What is stored: the items (with their copy of the food), as typed. */
export type StoredMealDraft = {
  items: MealItemDraft[]
  /** null: the applied dose follows the calculated one (spec §14 #46). */
  appliedDoseText: string | null
  /** null: "Ahora". */
  eatenAtText: string | null
  /** The saved meal this one corrects ("Corregir", spec §6.7), or null. */
  correcting: CorrectedMeal | null
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

const correctedMealSchema = z.object({
  mealId: z.guid(),
  eatenAt: z.iso.datetime({ offset: true }),
  eatenAtText: z.string(),
  appliedDose: z
    .object({ text: z.string(), value: z.number().nonnegative() })
    .nullable(),
  skipped: z.array(
    z.object({
      foodName: z.string(),
      reason: z.enum([
        'NOT_IN_CATALOG',
        'MISSING_COOKING_FACTOR',
        'NO_UNIT_WEIGHT',
      ]),
    }),
  ),
}) satisfies z.ZodType<CorrectedMeal>

const storedMealDraftSchema = z
  .object({
    items: z.array(storedItemSchema).min(1),
    appliedDoseText: z.string().nullable(),
    eatenAtText: z.string().nullable(),
    // Missing in a meal kept before corrections existed: not one.
    correcting: correctedMealSchema
      .nullish()
      .transform((value) => value ?? null),
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

/**
 * The notices of a saved meal loaded in Inicio: when it was eaten, if it was
 * repeated ("Copiaste la comida de…"; null when correcting or if nothing
 * was loaded), and the items that could not be brought.
 */
export type CopyNotice = {
  repeatedFrom: string | null
  skipped: SkippedItem[]
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
  copyNotice: CopyNotice | null
}

const EMPTY_DRAFT: StoredMealDraft = {
  items: [],
  appliedDoseText: null,
  eatenAtText: null,
  correcting: null,
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
  const draft = stored ?? EMPTY_DRAFT
  const nextKey = nextItemKey(draft.items)
  const base = {
    ...draft,
    nextKey,
    focusKey: null,
    notUsableFood: null,
    copyNotice: null,
  }
  if (addedFood === null) return base
  if (needsCookingFactor(addedFood.state, addedFood.cooking_factor)) {
    return {
      ...base,
      notUsableFood: { id: addedFood.id, name: addedFood.name },
    }
  }
  return {
    ...base,
    items: [...draft.items, newItemDraft(nextKey, addedFood)],
    nextKey: nextKey + 1,
    focusKey: nextKey,
  }
}

/**
 * The meal form with a saved meal loaded ("Repetir" or "Corregir", spec
 * §6.6), with today's foods (`foods`, the active ones). It replaces the
 * meal in progress (the detail asked first). If no item could be brought,
 * nothing is loaded: the meal in progress (`stored`) stays as it was, and
 * only the notices of the items show.
 */
export function copiedMealForm(
  stored: StoredMealDraft | null,
  request: MealCopyRequest,
  foods: readonly Food[],
): InitialMealForm {
  const copy = copiedMeal(request, foods)
  if (copy.items.length === 0) {
    return {
      ...initialMealForm(stored, null),
      copyNotice: { repeatedFrom: null, skipped: copy.skipped },
    }
  }
  return {
    items: copy.items,
    appliedDoseText: copy.appliedDoseText,
    eatenAtText: copy.eatenAtText,
    correcting: copy.correcting,
    nextKey: nextItemKey(copy.items),
    focusKey: null,
    notUsableFood: null,
    // Correcting, the items not brought stay in the notice of the
    // correction (correcting.skipped) until saving or cancelling.
    copyNotice:
      request.mode === 'repeat'
        ? { repeatedFrom: request.eatenAt, skipped: copy.skipped }
        : null,
  }
}
