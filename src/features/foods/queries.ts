import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { foodsKeys, type Food } from '../../lib/foods.ts'
import { archiveFood, createFood, fetchFood, updateFood } from './api.ts'

// foodsKeys and useFoods (the list) live in lib/foods.ts, shared with the
// meal screen.

export function useFood(id: string) {
  return useQuery({
    queryKey: foodsKeys.detail(id),
    queryFn: () => fetchFood(id),
  })
}

// No optimistic updates (CLAUDE.md): the detail gets the row the server
// returned, and the list is read again.
function useSaveFoodSuccess() {
  const queryClient = useQueryClient()
  return (food: Food) => {
    queryClient.setQueryData(foodsKeys.detail(food.id), food)
    return queryClient.invalidateQueries({ queryKey: foodsKeys.list })
  }
}

export function useCreateFood() {
  const onSuccess = useSaveFoodSuccess()
  return useMutation({ mutationFn: createFood, onSuccess })
}

export function useUpdateFood() {
  const onSuccess = useSaveFoodSuccess()
  return useMutation({ mutationFn: updateFood, onSuccess })
}

// Runs after the server confirmed (not optimistic). The list is inactive
// while the detail is shown, so the archived food is removed from the cache
// too: otherwise, going back would show it until the list is read again.
export function useArchiveFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: archiveFood,
    onSuccess: (food: Food) => {
      queryClient.setQueryData(foodsKeys.detail(food.id), food)
      queryClient.setQueryData<Food[]>(foodsKeys.list, (old) =>
        old?.filter((f) => f.id !== food.id),
      )
      return queryClient.invalidateQueries({ queryKey: foodsKeys.list })
    },
  })
}
