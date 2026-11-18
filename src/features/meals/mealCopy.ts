import { z } from 'zod'
import {
  formatDoseCompact,
  formatUserNumber,
  needsCookingFactor,
} from '../../domain/dose/index.ts'
import type { MealCopySkipReason } from '../../lib/errors.ts'
import type { Food } from '../../lib/foods.ts'
import { dateTimeInputValue } from './eatenAt.ts'
import { canUseUnits, type LoadedValue } from './mealDraft.ts'
import { itemsInOrder } from './recentMeals.ts'
import {
  copyableMealItemSchema,
  type CopyableMealItem,
  type MealItemDraft,
} from './types.ts'

// "Repetir" and "Corregir" a saved meal (spec §6.6, §6.7): its items loaded
// in Inicio again, each with the food as it is today in the catalog. Only
// the quantities as they were entered are copied: the carbs and the dose
// are calculated again, with today's values and ratio.

/** An item that could not be copied, and why. */
export type SkippedItem = { foodName: string; reason: MealCopySkipReason }

/**
 * The items of a saved meal as items of the meal form, in the order they
 * were entered, with keys from 0. Each one takes its food from the catalog
 * (`foods`: the active ones, by food_id) and its quantity as it was entered,
 * exact, in its mode. An item is not copied (and comes back in `skipped`,
 * with its saved name) if its food is not in the catalog (archived or
 * gone), still needs how much it yields, or was entered in units and the
 * food has no weight per unit today.
 */
export function copyMealItems(
  items: readonly CopyableMealItem[],
  foods: readonly Food[],
): { items: MealItemDraft[]; skipped: SkippedItem[] } {
  const byId = new Map(foods.map((food) => [food.id, food]))
  const copied: MealItemDraft[] = []
  const skipped: SkippedItem[] = []
  for (const item of itemsInOrder(items)) {
    const food = byId.get(item.food_id)
    const skip = (reason: MealCopySkipReason) =>
      skipped.push({ foodName: item.food_name, reason })
    if (food === undefined) {
      skip('NOT_IN_CATALOG')
    } else if (needsCookingFactor(food.state, food.cooking_factor)) {
      skip('MISSING_COOKING_FACTOR')
    } else if (item.quantity_mode === 'units' && !canUseUnits(food)) {
      skip('NO_UNIT_WEIGHT')
    } else {
      const quantity = item.quantity_mode === 'units' ? item.units : item.grams
      copied.push({
        key: copied.length,
        food,
        quantityMode: item.quantity_mode,
        quantityText: quantity === null ? '' : formatUserNumber(quantity),
      })
    }
  }
  return { items: copied, skipped }
}

/** "Repetir" (the date "Ahora") or "Corregir" (its own date and dose). */
export type MealCopyMode = 'repeat' | 'correct'

/** The saved meal the detail sends to Inicio to repeat or correct. */
export type MealCopyRequest = {
  mode: MealCopyMode
  mealId: string
  eatenAt: string
  appliedDoseUnits: number | null
  items: CopyableMealItem[]
}

const mealCopyStateSchema = z.object({
  copyMeal: z.object({
    mode: z.enum(['repeat', 'correct']),
    mealId: z.guid(),
    eatenAt: z.iso.datetime({ offset: true }),
    appliedDoseUnits: z.number().nonnegative().nullable(),
    items: z.array(copyableMealItemSchema).min(1),
  }),
}) satisfies z.ZodType<{ copyMeal: MealCopyRequest }>

// The detail and Inicio talk through the router's navigation state, like
// the photo (src/lib/mealHandoff.ts); both are of this feature. The state
// survives a reload, so it enters as `unknown` and is validated.

/** The navigation state that asks Inicio to load a saved meal. */
export function mealCopyState(request: MealCopyRequest): {
  copyMeal: MealCopyRequest
} {
  return { copyMeal: request }
}

/** The saved meal Inicio has to load, or null if the state has none. */
export function mealCopyRequest(state: unknown): MealCopyRequest | null {
  const parsed = mealCopyStateSchema.safeParse(state)
  return parsed.success ? parsed.data.copyMeal : null
}

/**
 * The meal that is being corrected, kept with the meal in progress (spec
 * §6.7): which one it replaces, its date and applied dose as they were
 * loaded (while their fields keep those texts, the exact values are saved),
 * and the items that could not be brought, shown until saving or
 * cancelling.
 */
export type CorrectedMeal = {
  mealId: string
  eatenAt: string
  /** The date field as it was loaded (Buenos Aires, to the minute). */
  eatenAtText: string
  /** The applied dose as loaded, or null if the meal had none. */
  appliedDose: LoadedValue<number> | null
  skipped: SkippedItem[]
}

/**
 * What the meal form loads from a request: the items (copyMealItems), and
 * the applied dose, date and correction. Repeating starts with the dose
 * following the calculated one and the date in "Ahora". Correcting starts
 * with the meal's date and time (Buenos Aires, to the minute) and its
 * applied dose without trailing zeros ("8,55"; empty if it had none), and
 * remembers which meal it replaces, the exact values loaded and the items
 * not brought.
 */
export function copiedMeal(
  request: MealCopyRequest,
  foods: readonly Food[],
): {
  items: MealItemDraft[]
  skipped: SkippedItem[]
  appliedDoseText: string | null
  eatenAtText: string | null
  correcting: CorrectedMeal | null
} {
  const { items, skipped } = copyMealItems(request.items, foods)
  if (request.mode === 'repeat') {
    return {
      items,
      skipped,
      appliedDoseText: null,
      eatenAtText: null,
      correcting: null,
    }
  }
  const appliedDose =
    request.appliedDoseUnits === null
      ? null
      : {
          text: formatDoseCompact(request.appliedDoseUnits),
          value: request.appliedDoseUnits,
        }
  const eatenAtText = dateTimeInputValue(new Date(request.eatenAt))
  return {
    items,
    skipped,
    appliedDoseText: appliedDose?.text ?? '',
    eatenAtText,
    correcting: {
      mealId: request.mealId,
      eatenAt: request.eatenAt,
      eatenAtText,
      appliedDose,
      skipped,
    },
  }
}
