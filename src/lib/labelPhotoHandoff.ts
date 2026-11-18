import { z } from 'zod'

// The photo of a label picked in Inicio or in "Mis alimentos" (spec §6.1,
// UX-16): the button opens the camera or the gallery in the same tap, and
// the photo screen starts with the photo already picked. A File does not go
// in the navigation state (it would be kept in the browser history, and a
// reload would upload it again): it is held here, in memory, and the state
// only carries its number. After a reload the photo is gone, and the screen
// asks for one.

let held: { id: number; file: File } | null = null
let lastId = 0

/**
 * Holds the picked photo (a new one replaces the last) and gives the
 * navigation state that tells the photo screen to take it.
 */
export function holdLabelPhoto(file: File): { labelPhoto: number } {
  lastId += 1
  held = { id: lastId, file }
  return { labelPhoto: lastId }
}

const heldPhotoSchema = z.object({ labelPhoto: z.number() })

/**
 * The photo the navigation state points to, or null (no state, a reload, or
 * a photo already let go or replaced by a newer one). It does not let it go:
 * reading it twice gives the same photo.
 */
export function heldLabelPhoto(state: unknown): File | null {
  const parsed = heldPhotoSchema.safeParse(state)
  if (!parsed.success || held === null) return null
  return held.id === parsed.data.labelPhoto ? held.file : null
}

/** Lets the held photo go, once the photo screen has it. */
export function releaseLabelPhoto(): void {
  held = null
}
