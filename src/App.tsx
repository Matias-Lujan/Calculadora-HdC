import { QueryClientProvider } from '@tanstack/react-query'
import { LucideProvider } from 'lucide-react'
import { RouterProvider } from 'react-router/dom'
import { queryClient } from './lib/queryClient.ts'
import { router } from './router.tsx'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Every icon is 20 px with a 2 px stroke (docs/ux/revision-1.md §2.6). */}
      <LucideProvider size={20} strokeWidth={2}>
        <RouterProvider router={router} />
      </LucideProvider>
    </QueryClientProvider>
  )
}
