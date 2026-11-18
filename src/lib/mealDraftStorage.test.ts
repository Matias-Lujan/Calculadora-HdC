import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearMealDraft,
  hasMealDraft,
  readMealDraft,
  writeMealDraft,
} from './mealDraftStorage.ts'

// A minimal sessionStorage (Node has none).
function stubSessionStorage() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  vi.stubGlobal('sessionStorage', storage)
  return storage
}

function failing() {
  throw new Error('SecurityError')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mealDraftStorage', () => {
  it('reads back what it wrote, and nothing after clearing it', () => {
    stubSessionStorage()
    expect(readMealDraft()).toBeNull()
    writeMealDraft({ items: [{ key: 0 }], eatenAtText: null })
    expect(readMealDraft()).toEqual({ items: [{ key: 0 }], eatenAtText: null })
    clearMealDraft()
    expect(readMealDraft()).toBeNull()
  })

  it('reads text that is not JSON as nothing', () => {
    const storage = stubSessionStorage()
    storage.setItem('meal-draft', '{not json')
    expect(readMealDraft()).toBeNull()
  })

  it('never throws if sessionStorage fails or is missing', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: failing,
      setItem: failing,
      removeItem: failing,
    })
    expect(readMealDraft()).toBeNull()
    expect(() => writeMealDraft({ items: [] })).not.toThrow()
    expect(() => clearMealDraft()).not.toThrow()

    vi.stubGlobal('sessionStorage', undefined)
    expect(readMealDraft()).toBeNull()
    expect(() => writeMealDraft({ items: [] })).not.toThrow()
    expect(() => clearMealDraft()).not.toThrow()
  })

  it('has a meal in progress only with a stored draft with items (UX-20)', () => {
    const storage = stubSessionStorage()
    expect(hasMealDraft()).toBe(false)
    writeMealDraft({ items: [{ key: 0 }] })
    expect(hasMealDraft()).toBe(true)
    for (const draft of [{ items: [] }, { items: 'x' }, {}, [], 3, null]) {
      writeMealDraft(draft)
      expect(hasMealDraft(), JSON.stringify(draft)).toBe(false)
    }
    storage.setItem('meal-draft', '{not json')
    expect(hasMealDraft()).toBe(false)
    clearMealDraft()
    expect(hasMealDraft()).toBe(false)
  })

  it('has no meal in progress if sessionStorage fails', () => {
    vi.stubGlobal('sessionStorage', { getItem: failing })
    expect(hasMealDraft()).toBe(false)
  })
})
