import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase.ts'
import type { SignInInput } from './types.ts'

export async function signIn({ email, password }: SignInInput) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
}

// Emits the current session right away (INITIAL_SESSION) and then every
// change. The callback stays synchronous: supabase-js recommends not
// calling other Supabase methods inside it.
export function onSessionChange(
  callback: (session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => subscription.unsubscribe()
}
