import {
  LOAD_ERROR_MESSAGE,
  SIGN_OUT_ERROR_MESSAGE,
} from '../../../lib/errors.ts'
import { useSettings } from '../../../lib/settings.ts'
import { SettingsForm } from '../components/SettingsForm.tsx'
import { useSignOut } from '../queries.ts'

export function SettingsPage() {
  const settings = useSettings()
  const signOut = useSignOut()

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Configuración</h1>

      {/* With data, the form stays even if a later refetch fails, so what
          the user is editing is not lost. */}
      {settings.data !== undefined ? (
        <SettingsForm initial={settings.data} />
      ) : settings.isError ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-red-700">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            className="min-h-11 self-start rounded-lg border border-slate-300 px-4 text-base disabled:opacity-60"
            disabled={settings.isFetching}
            onClick={() => void settings.refetch()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <p className="text-slate-500">Cargando…</p>
      )}

      {/* SIGNED_OUT reaches RequireAuth, which goes to the login. */}
      <div className="flex flex-col gap-2 border-t border-slate-200 pt-6">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-base font-medium disabled:opacity-60"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          Cerrar sesión
        </button>
        {signOut.isError && (
          <p role="alert" className="text-sm text-red-700">
            {SIGN_OUT_ERROR_MESSAGE}
          </p>
        )}
      </div>

      {/* USDA attribution for the table of foods (spec §5.2, §14 #50). */}
      <p className="text-sm text-slate-500">
        Los valores de la tabla de alimentos son de{' '}
        <a
          href="https://fdc.nal.usda.gov/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          USDA FoodData Central
        </a>
        , del Departamento de Agricultura de EE. UU. (dominio público).
      </p>
    </section>
  )
}
