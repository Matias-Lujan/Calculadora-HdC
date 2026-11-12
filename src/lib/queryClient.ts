import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isUnauthorized } from './errors.ts'
import { supabase } from './supabase.ts'

// A revoked or expired session ends locally: onAuthStateChange emits
// SIGNED_OUT and RequireAuth sends the user back to the login.
function onError(error: unknown) {
  if (isUnauthorized(error)) {
    void supabase.auth.signOut({ scope: 'local' })
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      // Up to 3 retries (react-query's default), except for 401s, which
      // are never retried.
      retry: (failureCount, error) =>
        !isUnauthorized(error) && failureCount < 3,
    },
  },
})
