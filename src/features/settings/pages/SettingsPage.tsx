import { Notice } from '../../../components/Notice.tsx'
import { button, pageTitle } from '../../../components/styles.ts'
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
      <h1 className={pageTitle}>Configuración</h1>

      {/* With data, the form stays even if a later refetch fails, so what
          the user is editing is not lost. */}
      {settings.data !== undefined ? (
        <SettingsForm initial={settings.data} />
      ) : settings.isError ? (
        <div className="flex flex-col gap-3">
          <Notice tone="error" role="alert">
            <p>{LOAD_ERROR_MESSAGE}</p>
          </Notice>
          <button
            type="button"
            className={`${button.secondary} self-start`}
            disabled={settings.isFetching}
            onClick={() => void settings.refetch()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <p className="text-ink-soft">Cargando…</p>
      )}

      {/* SIGNED_OUT reaches RequireAuth, which goes to the login. */}
      <div className="flex flex-col gap-2 border-t border-line pt-6">
        <button
          type="button"
          className={button.secondary}
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          Cerrar sesión
        </button>
        {signOut.isError && (
          <Notice tone="error" role="alert">
            <p>{SIGN_OUT_ERROR_MESSAGE}</p>
          </Notice>
        )}
      </div>

      {/* USDA attribution for the table of foods (spec §5.2, §14 #50). */}
      <p className="text-sm text-ink-soft">
        Los valores de la tabla de alimentos son de{' '}
        <a
          href="https://fdc.nal.usda.gov/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          USDA FoodData Central
        </a>
        , del Departamento de Agricultura de EE. UU. (dominio público).
      </p>
    </section>
  )
}
