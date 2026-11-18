import { z } from 'zod'
import { foodSchema, type Food } from './foods.ts'

// "Con foto" and "Agregar a mano" from Inicio (spec §6.1, §6.3, §6.6, §14
// #61). The two features talk through the router's navigation state, so
// neither imports the other's internals:
// - Inicio opens /foods/label or /foods/new with fromMealState() (the
//   manual one, with what was searched as the name to start with);
// - the screen, opened that way, goes back to Inicio after saving with
//   addToMealState(food), and Inicio adds that food to the meal.
// The navigation state survives a reload (history.state), so it enters as
// `unknown` and is validated here.

export const FROM_MEAL_STATE = { fromMeal: true } as const

const fromMealSchema = z.object({
  fromMeal: z.literal(true),
  name: z.string().optional(),
})

/**
 * The state that opens a new food screen from Inicio; `name`, the name the
 * manual one starts with (what was searched).
 */
export function fromMealState(name?: string): {
  fromMeal: true
  name?: string
} {
  return name === undefined ? FROM_MEAL_STATE : { fromMeal: true, name }
}

/** Whether the screen was opened from Inicio. */
export function isFromMeal(state: unknown): boolean {
  return fromMealSchema.safeParse(state).success
}

/** The name a new food starts with when opened from Inicio, or "". */
export function nameFromMeal(state: unknown): string {
  const parsed = fromMealSchema.safeParse(state)
  return parsed.success ? (parsed.data.name ?? '') : ''
}

const addToMealSchema = z.object({ addToMeal: foodSchema })

/** The navigation state that asks Inicio to add a just saved food. */
export function addToMealState(food: Food): { addToMeal: Food } {
  return { addToMeal: food }
}

/** The food Inicio has to add, or null if the state does not carry one. */
export function foodToAddToMeal(state: unknown): Food | null {
  const parsed = addToMealSchema.safeParse(state)
  return parsed.success ? parsed.data.addToMeal : null
}
