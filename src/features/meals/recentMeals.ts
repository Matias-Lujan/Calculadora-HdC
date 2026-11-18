import { needsCookingFactor } from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'
import { secondOfDayAt } from './eatenAt.ts'
import type { CopyableMealItem, RecentMeal } from './types.ts'

// The shortcuts of an empty Inicio (spec §6.6): "Recientes" and "A esta
// hora comiste". Only dates and the order of the meals: no math of carbs or
// doses.

/** How many foods "Recientes" shows at most. */
export const RECENT_FOODS_MAX = 6
/** How many meals "A esta hora comiste" shows at most. */
export const SUGGESTED_MEALS_MAX = 3
/** How far back "A esta hora comiste" looks. */
export const SUGGESTION_DAYS = 7
/** How far the time of day of a meal can be from now, either way. */
export const SUGGESTION_WINDOW_SECONDS = 2 * 60 * 60
/** A meal eaten less than this long ago is not offered: it was just eaten. */
export const JUST_EATEN_MS = 3 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_SECONDS = 24 * 60 * 60

/** The items of a meal in the order they were entered. */
export function itemsInOrder(
  items: readonly CopyableMealItem[],
): CopyableMealItem[] {
  return items.toSorted((a, b) => a.position - b.position)
}

/**
 * The last distinct foods used in the meals (`meals` most recent first; the
 * items of each in the order they were entered), as they are now in the
 * catalog (`foods`: the active ones). A food that is not there (archived or
 * gone) is left out, and so is one that cannot be picked (cooked, without
 * how much it yields, spec §6.4). At most RECENT_FOODS_MAX.
 */
export function recentFoods(
  meals: readonly RecentMeal[],
  foods: readonly Food[],
): Food[] {
  const byId = new Map(foods.map((food) => [food.id, food]))
  const seen = new Set<string>()
  const recent: Food[] = []
  for (const meal of meals) {
    for (const item of itemsInOrder(meal.meal_items)) {
      if (recent.length === RECENT_FOODS_MAX) return recent
      if (seen.has(item.food_id)) continue
      seen.add(item.food_id)
      const food = byId.get(item.food_id)
      if (food === undefined) continue
      if (needsCookingFactor(food.state, food.cooking_factor)) continue
      recent.push(food)
    }
  }
  return recent
}

/** The meals Inicio offers to repeat, and the title they go under. */
export type SuggestedMeals = {
  title: 'A esta hora comiste' | 'Tus últimas comidas'
  meals: RecentMeal[]
}

/**
 * Whether a meal was eaten in the last SUGGESTION_DAYS days, but not in the
 * last three hours (JUST_EATEN_MS: what was just eaten is not repeated) nor
 * in the future, at a time of day (Buenos Aires) at most two hours from now's,
 * either way, across midnight (23:30 and 00:30 are one hour apart).
 */
export function isAtThisTime(eatenAt: string, now: Date): boolean {
  const eaten = Date.parse(eatenAt)
  const ago = now.getTime() - eaten
  if (!(ago >= JUST_EATEN_MS && ago <= SUGGESTION_DAYS * DAY_MS)) return false
  const apart = Math.abs(secondOfDayAt(eaten) - secondOfDayAt(now.getTime()))
  return Math.min(apart, DAY_SECONDS - apart) <= SUGGESTION_WINDOW_SECONDS
}

/**
 * "A esta hora comiste": up to SUGGESTED_MEALS_MAX meals eaten at this time
 * of day (isAtThisTime), in the order of `meals` (most recent first). If
 * there is none, "Tus últimas comidas": the first ones of `meals`. null if
 * there are no meals.
 */
export function suggestedMeals(
  meals: readonly RecentMeal[],
  now: Date,
): SuggestedMeals | null {
  if (meals.length === 0) return null
  const atThisTime = meals.filter((meal) => isAtThisTime(meal.eaten_at, now))
  return atThisTime.length > 0
    ? {
        title: 'A esta hora comiste',
        meals: atThisTime.slice(0, SUGGESTED_MEALS_MAX),
      }
    : {
        title: 'Tus últimas comidas',
        meals: meals.slice(0, SUGGESTED_MEALS_MAX),
      }
}
