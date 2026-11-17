import { z } from 'zod'
import { foodSchema, type Food } from './foods.ts'

// "Con foto" from Inicio (spec §6.1, §6.6, §14 #61). The two
// features talk through the router's navigation state, so neither imports
// the other's internals:
// - Inicio opens /foods/label with FROM_MEAL_STATE;
// - the photo screen, opened that way, goes back to Inicio after saving with
//   addToMealState(food), and Inicio adds that food to the meal.
// The navigation state survives a reload (history.state), so it enters as
// `unknown` and is validated here.

export const FROM_MEAL_STATE = { fromMeal: true } as const

const fromMealSchema = z.object({ fromMeal: z.literal(true) })

/** Whether the screen was opened from Inicio. */
export function isFromMeal(state: unknown): boolean {
  return fromMealSchema.safeParse(state).success
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
