import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { button, pageTitle } from './styles.ts'

// Never shows the error message or stack to the user (CLAUDE.md).
function RouteErrorContent() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <>
      <h1 className={pageTitle}>
        {notFound
          ? 'Esta pantalla no existe.'
          : 'Algo salió mal al mostrar esta pantalla.'}
      </h1>
      <div className="flex gap-3">
        <Link to="/" className={`${button.secondary} flex-1`}>
          Ir al inicio
        </Link>
        <button
          type="button"
          className={`${button.primary} flex-1`}
          onClick={() => window.location.reload()}
        >
          Reintentar
        </button>
      </div>
    </>
  )
}

// Top-level routes (/login and the RequireAuth layout): full screen.
export function RootErrorBoundary() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <RouteErrorContent />
    </main>
  )
}

// Child routes: rendered inside AppLayout's <main>, above the nav bar.
export function RouteErrorBoundary() {
  return (
    <section className="flex flex-col gap-4">
      <RouteErrorContent />
    </section>
  )
}
