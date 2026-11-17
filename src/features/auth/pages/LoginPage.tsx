import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { LoadingScreen } from '../../../components/LoadingScreen.tsx'
import { Notice } from '../../../components/Notice.tsx'
import {
  button,
  field,
  fieldLabel,
  pageTitle,
} from '../../../components/styles.ts'
import { authErrorMessage } from '../../../lib/errors.ts'
import { useSignIn } from '../queries.ts'
import { useSession } from '../useSession.ts'

export function LoginPage() {
  const session = useSession()
  const signIn = useSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Until the stored session is read, show the same loading screen as
  // RequireAuth, so a logged-in user never sees the form flash.
  if (session === undefined) {
    return <LoadingScreen />
  }

  // After a successful login, onAuthStateChange emits SIGNED_IN and this
  // redirect takes the user to Inicio.
  if (session) {
    return <Navigate to="/" replace />
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    signIn.mutate({ email, password })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <h1 className={pageTitle}>Calculadora de HdC</h1>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Email</span>
          <input
            className={field}
            type="email"
            name="email"
            autoComplete="username"
            autoCapitalize="none"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Contraseña</span>
          <input
            className={field}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {signIn.isError && (
          <Notice tone="error" role="alert">
            <p>{authErrorMessage(signIn.error)}</p>
          </Notice>
        )}

        <button
          type="submit"
          className={button.primary}
          disabled={signIn.isPending}
        >
          {signIn.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="text-sm text-ink-soft">
        Proyecto personal. No es un dispositivo médico y no reemplaza la
        indicación médica.
      </p>
    </main>
  )
}
