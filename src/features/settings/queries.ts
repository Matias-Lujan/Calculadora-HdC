import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { settingsKeys, type Settings } from '../../lib/settings.ts'
import { signOut, updateSettings } from './api.ts'

// settingsKeys and useSettings (the read) live in lib/settings.ts, shared
// with the meal screen.

/**
 * After the server confirms a save: the row it returned goes to the cache of
 * useSettings right away, and then it is read again. Every screen has the
 * new settings at once, and they stay even if reading them again fails: the
 * settings form compares a new ratio with them (spec §6.8), and with the old
 * row it would ask to confirm a change that was already saved.
 */
export function afterSettingsSaved(
  queryClient: QueryClient,
  row: Settings,
): Promise<void> {
  queryClient.setQueryData(settingsKeys.detail, row)
  return queryClient.invalidateQueries({ queryKey: settingsKeys.all })
}

// No optimistic update: the form shows "Guardado." only when the server
// confirms (CLAUDE.md).
export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (row) => afterSettingsSaved(queryClient, row),
  })
}

export function useSignOut() {
  return useMutation({ mutationFn: signOut })
}
