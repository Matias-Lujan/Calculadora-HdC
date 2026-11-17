// The classes of the base components (docs/ux/revision-1.md §2.10), shared
// so every screen looks the same. Colors, sizes, corners and shadows are the
// tokens of src/index.css. Width and alignment (w-full, self-start, flex-1)
// go where each one is used.

/** Buttons, and links that look like buttons. */
export const button = {
  /** The main action: one per screen. */
  primary:
    'flex min-h-13 items-center justify-center gap-2 rounded-control bg-accent px-4 text-base font-semibold text-on-accent disabled:opacity-60',
  secondary:
    'flex min-h-12 items-center justify-center gap-2 rounded-control border-[1.5px] border-accent px-4 text-base font-medium text-accent disabled:opacity-60',
  /** To add something. */
  soft: 'flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent-soft px-4 text-base font-medium text-accent disabled:opacity-60',
  /** Only underlined text, with a 44 px tap area. */
  text: 'inline-flex min-h-11 items-center gap-2 font-medium text-accent underline underline-offset-2 disabled:opacity-60',
  /** Delete or archive, before the confirmation. */
  dangerText:
    'inline-flex min-h-11 items-center gap-2 font-medium text-danger underline underline-offset-2 disabled:opacity-60',
  /** Delete or archive, inside the confirmation. */
  danger:
    'flex min-h-12 items-center justify-center gap-2 rounded-control bg-danger px-4 text-base font-semibold text-on-danger disabled:opacity-60',
} as const

/** The link back to the previous screen, with a ChevronLeft before its text. */
export const backLink =
  'flex min-h-11 items-center gap-1 self-start font-medium text-accent'

/**
 * A button that folds and unfolds something ("Ver la cuenta", "Más
 * opciones"), with a DisclosureIcon before its text.
 */
export const disclosure =
  'flex min-h-11 items-center gap-2 font-medium text-accent'

/**
 * Text and number fields: while typing, the border turns accent and a 2 px
 * accent outline goes 2 px outside it (UX-13); with an error, a danger
 * border.
 */
export const field =
  'min-h-12 w-full rounded-control border-[1.5px] border-line-strong bg-surface px-3 text-base text-ink shadow-level-1 placeholder:text-ink-soft focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent aria-invalid:border-2 aria-invalid:border-danger'

/**
 * A shortcut to tap (docs/ux/revision-1.md §2.10): 44 px, sunken; the chosen
 * one (aria-pressed), accent with white text.
 */
export const chip =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-sunken px-4 font-display text-base font-semibold text-ink tabular-nums aria-pressed:bg-accent aria-pressed:text-on-accent disabled:opacity-60'

/** The label above a field. */
export const fieldLabel = 'text-sm font-medium text-ink-soft'

export const card =
  'rounded-card border border-line bg-surface p-4 shadow-level-1'

/** The title of a screen. */
export const pageTitle = 'font-display text-title font-bold'

/**
 * Two options side by side (Gramos/Unidades, Sí/No): a sunken pill with the
 * chosen one in white. The chosen one also has an accent border: white on the
 * pill alone does not reach the 3:1 contrast a state needs, and Gramos or
 * Unidades has to be seen at a glance.
 */
export const segmented = {
  group: 'flex gap-1 rounded-control bg-sunken p-1',
  option:
    'flex min-h-11 flex-1 items-center justify-center rounded-lg border-[1.5px] border-transparent px-3 text-center text-base text-ink',
  /** The chosen option, in a group of buttons with aria-pressed. */
  pressed:
    'aria-pressed:border-accent aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-ink aria-pressed:shadow-level-1',
  /** The chosen option, in a group of labels that hold a radio. */
  checked:
    'cursor-pointer has-checked:border-accent has-checked:bg-surface has-checked:font-semibold has-checked:text-ink has-checked:shadow-level-1 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
} as const
