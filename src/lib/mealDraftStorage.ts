// The meal being entered on Inicio, kept in sessionStorage while the app is
// open (spec §6.6, §14 #61): leaving Inicio and coming back does not lose
// it, and closing the app for good starts empty. It lives in lib because it
// is cleared on every sign-out (queryClient.ts), so another account on the
// same device never sees the previous one's meal. The meals feature
// validates what it reads (it enters as `unknown`).
//
// Every access is wrapped in try/catch: sessionStorage can be missing or
// throw (private browsing, a full quota), and then the meal is simply not
// kept.

const MEAL_DRAFT_KEY = 'meal-draft'

/** The stored draft, parsed from JSON; null if there is none or it fails. */
export function readMealDraft(): unknown {
  try {
    const text = sessionStorage.getItem(MEAL_DRAFT_KEY)
    return text === null ? null : (JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

/**
 * Whether there is a meal in progress, for the dot on Inicio in the bar
 * (UX-20): a stored draft with at least one item. Only its shape is looked
 * at; the meals feature validates the rest when Inicio reads it.
 */
export function hasMealDraft(): boolean {
  const draft = readMealDraft()
  if (typeof draft !== 'object' || draft === null || !('items' in draft)) {
    return false
  }
  return Array.isArray(draft.items) && draft.items.length > 0
}

export function writeMealDraft(draft: unknown): void {
  try {
    sessionStorage.setItem(MEAL_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Not kept: the meal stays in the form while Inicio is open.
  }
}

export function clearMealDraft(): void {
  try {
    sessionStorage.removeItem(MEAL_DRAFT_KEY)
  } catch {
    // Nothing to clear.
  }
}
