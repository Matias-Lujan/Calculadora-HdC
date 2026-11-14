import { useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsKeys } from '../../lib/settings.ts'
import { signOut, updateSettings } from './api.ts'

// settingsKeys and useSettings (the read) live in lib/settings.ts, shared
// with the meal screen.

// No optimistic update: the form shows "Guardado." only when the server
// confirms (CLAUDE.md).
export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  })
}

export function useSignOut() {
  return useMutation({ mutationFn: signOut })
}
