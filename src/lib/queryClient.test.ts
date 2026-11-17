import { onlineManager } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readMealDraft, writeMealDraft } from './mealDraftStorage.ts'
import { queryClient } from './queryClient.ts'

const auth = vi.hoisted(() => ({
  listener: null as ((event: string) => void) | null,
}))

vi.mock('./supabase.ts', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: (event: string) => void) => {
        auth.listener = listener
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: () => Promise.resolve({ error: null }),
    },
  },
}))

afterEach(() => {
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
})
describe('queryClient mutations', () => {
  it('use networkMode "always" and keep the default of no retries', () => {
    const mutations = queryClient.getDefaultOptions().mutations
    expect(mutations?.networkMode).toBe('always')
    expect(mutations?.retry).toBeUndefined()
  })

  it('leave the queries networkMode untouched', () => {
    expect(queryClient.getDefaultOptions().queries?.networkMode).toBeUndefined()
  })

  it('fail right away while offline instead of staying paused', async () => {
    onlineManager.setOnline(false)
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.reject(new Error('Failed to fetch')),
    })
    await expect(mutation.execute(undefined)).rejects.toThrow('Failed to fetch')
    expect(mutation.state.status).toBe('error')
    expect(mutation.state.isPaused).toBe(false)
  })

  // Same regression as above, but without waiting for the test timeout: a
  // paused mutation is detected as soon as the pending microtasks run.
  it('run the mutationFn while offline without pausing first', async () => {
    onlineManager.setOnline(false)
    const mutationFn = vi.fn(() => Promise.resolve('saved'))
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn,
    })
    const done = mutation.execute(undefined).catch(() => undefined)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(mutation.state.isPaused).toBe(false)
    expect(mutationFn).toHaveBeenCalledTimes(1)
    onlineManager.setOnline(true)
    await done
    expect(mutationFn).toHaveBeenCalledTimes(1)
  })
})

// A minimal sessionStorage (Node has none).
function stubSessionStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
}

describe('sign-out', () => {
  it('clears the cache and the meal being entered (spec §10)', () => {
    stubSessionStorage()
    writeMealDraft({ items: [] })
    queryClient.setQueryData(['foods', 'list'], [])
    auth.listener?.('SIGNED_OUT')
    expect(readMealDraft()).toBeNull()
    expect(queryClient.getQueryData(['foods', 'list'])).toBeUndefined()
  })

  it('keeps both on other events', () => {
    stubSessionStorage()
    writeMealDraft({ items: [] })
    queryClient.setQueryData(['foods', 'list'], [])
    auth.listener?.('TOKEN_REFRESHED')
    expect(readMealDraft()).toEqual({ items: [] })
    expect(queryClient.getQueryData(['foods', 'list'])).toEqual([])
    queryClient.clear()
  })

  it('is registered with supabase', () => {
    expect(auth.listener).not.toBeNull()
  })
})
