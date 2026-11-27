import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  PostgrestError,
} from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createPermissionDeniedCheck } from './session.ts'

function postgrestError(code: string) {
  return new PostgrestError({ message: 'x', details: '', hint: '', code })
}

const PERMISSION_DENIED = postgrestError('42501')

function fakeAuth(getUserError: unknown) {
  return {
    getUser: vi.fn(() => Promise.resolve({ error: getUserError })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
  }
}

describe('createPermissionDeniedCheck', () => {
  it('keeps the session when the server confirms the user', async () => {
    const auth = fakeAuth(null)
    await createPermissionDeniedCheck(auth)(PERMISSION_DENIED)
    expect(auth.getUser).toHaveBeenCalledTimes(1)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    ['no session', new AuthSessionMissingError()],
    ['session_not_found', new AuthApiError('x', 403, 'session_not_found')],
    ['bad_jwt', new AuthApiError('x', 401, 'bad_jwt')],
    ['user_not_found', new AuthApiError('x', 403, 'user_not_found')],
  ])('signs out locally with %s', async (_, error) => {
    const auth = fakeAuth(error)
    await createPermissionDeniedCheck(auth)(PERMISSION_DENIED)
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it.each([
    ['a network failure', new AuthRetryableFetchError('x', 0)],
    ['another auth error', new AuthApiError('x', 500, 'unexpected_failure')],
  ])('keeps the session with %s', async (_, error) => {
    const auth = fakeAuth(error)
    await createPermissionDeniedCheck(auth)(PERMISSION_DENIED)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('keeps the session when getUser throws', async () => {
    const auth = fakeAuth(null)
    auth.getUser.mockRejectedValueOnce(new Error('x'))
    await expect(
      createPermissionDeniedCheck(auth)(PERMISSION_DENIED),
    ).resolves.toBeUndefined()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    postgrestError('PGRST116'),
    postgrestError('23514'),
    postgrestError('PGRST301'),
    { code: 42501 },
    new Error('x'),
    null,
  ])('does not ask the server for other errors %#', async (error) => {
    const auth = fakeAuth(new AuthSessionMissingError())
    await createPermissionDeniedCheck(auth)(error)
    expect(auth.getUser).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('makes a single request for simultaneous 42501s', async () => {
    const auth = fakeAuth(new AuthSessionMissingError())
    const check = createPermissionDeniedCheck(auth)
    await Promise.all([check(PERMISSION_DENIED), check(PERMISSION_DENIED)])
    expect(auth.getUser).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('asks again for a 42501 after the previous request ended', async () => {
    const auth = fakeAuth(null)
    const check = createPermissionDeniedCheck(auth)
    await check(PERMISSION_DENIED)
    await check(PERMISSION_DENIED)
    expect(auth.getUser).toHaveBeenCalledTimes(2)
  })
})
