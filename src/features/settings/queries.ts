import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSettings, signOut, updateSettings } from './api.ts'

export const settingsKeys = {
  all: ['settings'] as const,
  detail: ['settings', 'detail'] as const,
}

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.detail, queryFn: fetchSettings })
}

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
