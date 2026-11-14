import { onlineManager } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from './queryClient.ts'

vi.mock('./supabase.ts', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signOut: () => Promise.resolve({ error: null }),
    },
  },
}))

afterEach(() => {
  onlineManager.setOnline(true)
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
