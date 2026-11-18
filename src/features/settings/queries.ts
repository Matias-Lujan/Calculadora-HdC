import { useMutation, useQueryClient } from '@tanstack/react-query'
import { afterSettingsSaved } from '../../lib/settings.ts'
import { signOut, updateSettings } from './api.ts'

// settingsKeys, useSettings (the read) and afterSettingsSaved live in
// lib/settings.ts, shared with the meal screen and the usage notice.

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
