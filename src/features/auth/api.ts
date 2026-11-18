import type { Session } from '@supabase/supabase-js'
import {
  SETTINGS_COLUMNS,
  settingsSchema,
  type Settings,
} from '../../lib/settings.ts'
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

/**
 * Saves that the user accepted the usage notice (plan M7), with the time of
 * this device. Only that column is sent (the others are the user's settings,
 * not touched here). .single() fails if no row was updated, so the notice
 * closes only when the server returns the row.
 */
export async function acceptUsageNotice(userId: string): Promise<Settings> {
  const { data, error } = await supabase
    .from('user_settings')
    .update({ usage_notice_accepted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) throw error
  return settingsSchema.parse(data as unknown)
}
