import { isAuthSessionMissingError } from '@supabase/supabase-js'
import { isPermissionDenied, isUnauthorized } from './errors.ts'

/** The part of the Supabase Auth client this check needs. */
export type SessionAuth = {
  getUser: () => Promise<{ error: unknown }>
  signOut: (options: { scope: 'local' }) => Promise<unknown>
}

/**
 * A 42501 (permission denied) can mean the call reached the server without
 * a user (anon has no permissions, spec §7.3) or a valid user that RLS or a
 * grant stopped. To tell them apart, the server is asked for the user: if it
 * says there is no valid session, the session ends locally (SIGNED_OUT leads
 * to the login, spec §10); if it confirms the user, or the network fails,
 * nothing happens and the screen shows its usual error. Simultaneous 42501s
 * share the request in flight.
 */
export function createPermissionDeniedCheck(
  auth: SessionAuth,
): (error: unknown) => Promise<void> {
  let inFlight: Promise<void> | null = null

  async function check(): Promise<void> {
    try {
      const { error } = await auth.getUser()
      if (isUnauthorized(error) || isAuthSessionMissingError(error)) {
        await auth.signOut({ scope: 'local' })
      }
    } catch {
      // An unexpected failure leaves the session as it is.
    }
  }

  return (error) => {
    if (!isPermissionDenied(error)) return Promise.resolve()
    inFlight ??= check().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
