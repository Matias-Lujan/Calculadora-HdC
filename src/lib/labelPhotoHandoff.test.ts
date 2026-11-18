import { beforeEach, describe, expect, it } from 'vitest'
import {
  heldLabelPhoto,
  holdLabelPhoto,
  releaseLabelPhoto,
} from './labelPhotoHandoff.ts'

// Invented photos.
const photo = new File(['a'], 'etiqueta.jpg', { type: 'image/jpeg' })
const other = new File(['b'], 'otra.jpg', { type: 'image/jpeg' })

describe('the photo picked before opening the photo screen', () => {
  beforeEach(() => releaseLabelPhoto())

  it('the state of the button gives the photo, as many times as read', () => {
    const state = holdLabelPhoto(photo)
    expect(heldLabelPhoto(state)).toBe(photo)
    expect(heldLabelPhoto(state)).toBe(photo)
  })

  it('with other keys in the state (opened from Inicio)', () => {
    const state = { fromMeal: true, ...holdLabelPhoto(photo) }
    expect(heldLabelPhoto(state)).toBe(photo)
  })

  it('after the browser history clones the state', () => {
    const state: unknown = structuredClone(holdLabelPhoto(photo))
    expect(heldLabelPhoto(state)).toBe(photo)
  })

  it('once let go, nothing (going back to the entry does not upload it again)', () => {
    const state = holdLabelPhoto(photo)
    releaseLabelPhoto()
    expect(heldLabelPhoto(state)).toBeNull()
  })

  it('a newer photo replaces the last: the old state gives nothing', () => {
    const first = holdLabelPhoto(photo)
    const second = holdLabelPhoto(other)
    expect(heldLabelPhoto(first)).toBeNull()
    expect(heldLabelPhoto(second)).toBe(other)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['{}', {}],
    ['only fromMeal', { fromMeal: true }],
    ['the number as text', { labelPhoto: '1' }],
  ])('%s: nothing', (_, state) => {
    holdLabelPhoto(photo)
    expect(heldLabelPhoto(state)).toBeNull()
  })
})
