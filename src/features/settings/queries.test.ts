import {
  QueryClient,
  QueryObserver,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { settingsKeys, type Settings } from '../../lib/settings.ts'
import { updateSettings } from './api.ts'
import { afterSettingsSaved, useUpdateSettings } from './queries.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))

// Only the hooks are replaced (to see what useUpdateSettings passes them);
// QueryClient and QueryObserver stay the real ones.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}))

// Invented values.
const before: Settings = {
  user_id: '00000000-0000-4000-8000-000000000001',
  carb_ratio_g_per_unit: 15,
  max_dose_warning_units: null,
  max_item_grams_warning: 500,
}
const saved: Settings = {
  ...before,
  carb_ratio_g_per_unit: 12,
  max_dose_warning_units: 15,
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('afterSettingsSaved', () => {
  it('puts the row the server returned in the cache right away', async () => {
    const queryClient = client()
    queryClient.setQueryData(settingsKeys.detail, before)
    const done = afterSettingsSaved(queryClient, saved)
    expect(queryClient.getQueryData(settingsKeys.detail)).toEqual(saved)
    await done
  })

  it('if reading them again fails, the saved settings stay, not the old ones', async () => {
    const queryClient = client()
    queryClient.setQueryData(settingsKeys.detail, before)
    // The settings are on screen, so invalidating reads them again.
    const observer = new QueryObserver(queryClient, {
      queryKey: settingsKeys.detail,
      queryFn: () => Promise.reject(new Error('Sin conexión')),
    })
    const stopShowing = observer.subscribe(() => {})
    await vi.waitFor(() => {
      expect(queryClient.getQueryState(settingsKeys.detail)?.status).toBe(
        'error',
      )
    })

    await afterSettingsSaved(queryClient, saved)

    const state = queryClient.getQueryState(settingsKeys.detail)
    expect(state?.status).toBe('error')
    expect(state?.data).toEqual(saved)
    stopShowing()
  })

  it('reads the settings again after putting the row', async () => {
    const queryClient = client()
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined)
    await afterSettingsSaved(queryClient, saved)
    expect(invalidate.mock.calls.map((call) => call[0])).toEqual([
      { queryKey: settingsKeys.all },
    ])
  })
})

describe('useUpdateSettings', () => {
  it('saves with updateSettings and, once confirmed, puts the row in the cache', async () => {
    const queryClient = client()
    queryClient.setQueryData(settingsKeys.detail, before)
    vi.mocked(useQueryClient).mockReturnValue(queryClient)
    vi.mocked(useMutation).mockClear()

    useUpdateSettings()
    const options = vi.mocked(useMutation).mock.calls[0]?.[0]
    expect(options?.mutationFn).toBe(updateSettings)
    await options?.onSuccess?.(
      saved as never,
      undefined as never,
      undefined as never,
      undefined as never,
    )
    expect(queryClient.getQueryData(settingsKeys.detail)).toEqual(saved)
  })

  it('without an optimistic update: nothing before the server confirms', () => {
    vi.mocked(useQueryClient).mockReturnValue(client())
    vi.mocked(useMutation).mockClear()
    useUpdateSettings()
    const options = vi.mocked(useMutation).mock.calls[0]?.[0]
    expect(options?.onMutate).toBeUndefined()
  })
})
