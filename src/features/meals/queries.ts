import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createMeal } from './api.ts'

// The history (stage 5, functionality 3) will read under these keys.
export const mealsKeys = {
  all: ['meals'] as const,
}

// No optimistic updates (CLAUDE.md): "Comida guardada." is shown only when
// the server confirms. A 401 is handled by the global MutationCache.
export function useCreateMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMeal,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mealsKeys.all }),
  })
}
