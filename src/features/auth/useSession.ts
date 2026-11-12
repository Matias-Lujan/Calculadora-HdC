import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { onSessionChange } from './api.ts'

// undefined: not known yet (supabase-js is still reading the stored session).
// null: no session.
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => onSessionChange(setSession), [])

  return session
}
