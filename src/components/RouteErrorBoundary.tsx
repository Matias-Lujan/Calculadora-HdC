import { Link, isRouteErrorResponse, useRouteError } from 'react-router'

// Never shows the error message or stack to the user (CLAUDE.md).
function RouteErrorContent() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <>
      <h1 className="text-xl font-semibold">
        {notFound
          ? 'Esta pantalla no existe.'
          : 'Algo salió mal al mostrar esta pantalla.'}
      </h1>
      <div className="flex gap-3">
        <Link
          to="/"
          className="flex min-h-11 items-center rounded-lg border border-slate-300 px-4"
        >
          Ir al inicio
        </Link>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-slate-900 px-4 text-white"
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8 text-slate-900">
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
