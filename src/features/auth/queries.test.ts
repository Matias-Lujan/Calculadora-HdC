import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsKeys, type Settings } from '../../lib/settings.ts'
import { supabase } from '../../lib/supabase.ts'
import { acceptUsageNotice } from './api.ts'
import { useAcceptUsageNotice } from './queries.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: { from: vi.fn() } }))

// Only the hooks are replaced (to see what useAcceptUsageNotice passes
// them); QueryClient stays the real one.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}))

// Invented values.
const before: Settings = {
  user_id: '00000000-0000-4000-8000-000000000001',
  carb_ratio_g_per_unit: 15,
  max_dose_warning_units: 10,
  max_item_grams_warning: 500,
  usage_notice_accepted_at: null,
}
const accepted: Settings = {
  ...before,
  usage_notice_accepted_at: '2026-11-18T12:00:00+00:00',
}

/** The query builder of supabase-js, recording the update payload. */
function mockUpdate(result: { data: unknown; error: unknown }) {
  const update = vi.fn()
  const eq = vi.fn()
  const builder = {
    update: (payload: unknown) => {
      update(payload)
      return builder
    },
    eq: (column: string, value: unknown) => {
      eq(column, value)
      return builder
    },
    select: () => builder,
    single: () => Promise.resolve(result),
  }
  vi.mocked(supabase.from).mockReturnValue(builder as never)
  return { update, eq }
}

beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
})

describe('acceptUsageNotice', () => {
  it('sends only the acceptance date, for the user, and returns the row', async () => {
    const { update, eq } = mockUpdate({ data: accepted, error: null })
    await expect(acceptUsageNotice(before.user_id)).resolves.toEqual(accepted)
    expect(supabase.from).toHaveBeenCalledWith('user_settings')
    const payload: unknown = update.mock.calls[0]?.[0]
    expect(Object.keys(payload as object)).toEqual(['usage_notice_accepted_at'])
    const date = (payload as { usage_notice_accepted_at: string })
      .usage_notice_accepted_at
    expect(Number.isNaN(Date.parse(date))).toBe(false)
    expect(eq).toHaveBeenCalledWith('user_id', before.user_id)
  })

  it('fails if the server fails, so the notice stays open', async () => {
    const error = { code: '500', message: 'x' }
    mockUpdate({ data: null, error })
    await expect(acceptUsageNotice(before.user_id)).rejects.toBe(error)
  })
})

describe('useAcceptUsageNotice', () => {
  function client() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } })
  }

  it('saves with acceptUsageNotice and, once confirmed, puts the row in the cache', async () => {
    const queryClient = client()
    queryClient.setQueryData(settingsKeys.detail, before)
    vi.mocked(useQueryClient).mockReturnValue(queryClient)
    vi.mocked(useMutation).mockClear()

    useAcceptUsageNotice()
    const options = vi.mocked(useMutation).mock.calls[0]?.[0]
    expect(options?.mutationFn).toBe(acceptUsageNotice)
    await options?.onSuccess?.(
      accepted as never,
      undefined as never,
      undefined as never,
      undefined as never,
    )
    expect(queryClient.getQueryData(settingsKeys.detail)).toEqual(accepted)
  })

  it('without an optimistic update: nothing before the server confirms', () => {
    vi.mocked(useQueryClient).mockReturnValue(client())
    vi.mocked(useMutation).mockClear()
    useAcceptUsageNotice()
    const options = vi.mocked(useMutation).mock.calls[0]?.[0]
    expect(options?.onMutate).toBeUndefined()
  })
})
