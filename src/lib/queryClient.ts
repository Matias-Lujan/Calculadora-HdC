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
    mutations: {
      // Offline, a mutation fails right away (and the UI shows "No se pudo
      // guardar…" with a retry) instead of staying paused and being sent on
      // its own when the connection comes back, which could duplicate a meal
      // the user loaded again.
      networkMode: 'always',
    },
  },
})

// Every sign-out (the "Cerrar sesión" button, a 401, a rejected refresh)
// clears the cache, so another account on the same device never sees the
// previous one's data. The callback stays synchronous and calls nothing else
// from Supabase (supabase-js recommendation).
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') queryClient.clear()
})
