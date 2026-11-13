import { useQuery } from '@tanstack/react-query'
import { fetchFood, fetchFoods } from './api.ts'

// The search is not part of the key: it filters the cached list in the client.
export const foodsKeys = {
  all: ['foods'] as const,
  list: ['foods', 'list'] as const,
  detail: (id: string) => ['foods', 'detail', id] as const,
}

export function useFoods() {
  return useQuery({ queryKey: foodsKeys.list, queryFn: fetchFoods })
}

export function useFood(id: string) {
  return useQuery({
    queryKey: foodsKeys.detail(id),
    queryFn: () => fetchFood(id),
  })
}
