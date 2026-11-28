import { LoadingShapes } from '../../../components/LoadingShapes.tsx'
import { Notice } from '../../../components/Notice.tsx'
import {
  button,
  card,
  cardTitle,
  pageTitle,
} from '../../../components/styles.ts'
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
          the user is editing is not lost. The data takes the row of each
          save right away (afterSettingsSaved). */}
      {settings.data !== undefined ? (
        <SettingsForm saved={settings.data} />
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
        // "Tu ratio" and "Alertas".
        <LoadingShapes shapes={['h-40', 'h-56']} />
      )}

      {/* SIGNED_OUT reaches RequireAuth, which goes to the login. */}
      <section className={`flex flex-col gap-3 ${card}`}>
        <h2 className={cardTitle}>Cuenta</h2>
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
      </section>

      {/* At the foot, in small (UX-25): the USDA attribution for the table
          of foods (spec §5.2, §14 #50) and the reminder of what the app is
          not. */}
      <footer className="flex flex-col gap-2 text-xs text-ink-soft">
        <p>
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
        <p>No es un dispositivo médico.</p>
      </footer>
    </section>
  )
}
