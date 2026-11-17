// Taking the user to the first thing to fix when saving finds errors
// (UX-14). DOM only, no logic of a form: each form decides what is wrong.

/**
 * Puts the element in the middle of the screen and gives it the focus.
 * The middle leaves it clear of the dose display stuck at the top of Inicio
 * and of the bar at the bottom. Called inside the tap on "Guardar", so iOS
 * opens the keyboard of a field.
 */
export function revealAndFocus(element: HTMLElement | null): void {
  if (element === null) return
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: 'center' })
}

const FOCUSABLE = 'input, textarea, select, button'

/**
 * Takes the user to the first control of `container` marked with an error
 * (`aria-invalid="true"`), in the order of the screen. A group marked as a
 * whole (the "Sí"/"No" of a food) is shown whole, and its first option
 * gets the focus. Nothing happens if there is none.
 */
export function focusFirstInvalid(container: HTMLElement | null): void {
  const invalid = container?.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (invalid === null || invalid === undefined) return
  if (invalid.matches(FOCUSABLE)) {
    revealAndFocus(invalid)
    return
  }
  invalid.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
  invalid.scrollIntoView({ block: 'center' })
}
