import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { LoadingScreen } from '../../../components/LoadingScreen.tsx'
import { authErrorMessage } from '../../../lib/errors.ts'
import { useSignIn } from '../queries.ts'
import { useSession } from '../useSession.ts'

const inputClass =
  'min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-500 focus:outline-none'

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-slate-900">
      <h1 className="text-2xl font-semibold">Calculadora de HdC</h1>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            className={inputClass}
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
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            className={inputClass}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {signIn.isError && (
          <p role="alert" className="text-sm text-red-700">
            {authErrorMessage(signIn.error)}
          </p>
        )}

        <button
          type="submit"
          className="min-h-11 rounded-lg bg-slate-900 px-4 text-base font-medium text-white disabled:opacity-60"
          disabled={signIn.isPending}
        >
          {signIn.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="text-sm text-slate-500">
        Proyecto personal. No es un dispositivo médico y no reemplaza la
        indicación médica.
      </p>
    </main>
  )
}
