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
