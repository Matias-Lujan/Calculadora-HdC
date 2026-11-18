import { useMutation, useQueryClient } from '@tanstack/react-query'
import { afterSettingsSaved } from '../../lib/settings.ts'
import { acceptUsageNotice, signIn } from './api.ts'

export function useSignIn() {
  return useMutation({ mutationFn: signIn })
}

// No optimistic update: the notice closes only when the server confirms
// (CLAUDE.md), with the row it returned.
export function useAcceptUsageNotice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: acceptUsageNotice,
    onSuccess: (row) => afterSettingsSaved(queryClient, row),
  })
}
