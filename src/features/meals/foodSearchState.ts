import { z } from 'zod'

// The search of Inicio over the whole screen (spec §6.6, UX-08) has its own
// entry in the browser history, so "atrás" closes it like the ✕. The entry
// is Inicio with this navigation state; it survives a reload, so it enters
// as `unknown` and is validated.

export const FOOD_SEARCH_STATE = { foodSearch: true } as const

const foodSearchSchema = z.object({ foodSearch: z.literal(true) })

/** Whether the entry of the browser history is the open search. */
export function isFoodSearchState(state: unknown): boolean {
  return foodSearchSchema.safeParse(state).success
}
