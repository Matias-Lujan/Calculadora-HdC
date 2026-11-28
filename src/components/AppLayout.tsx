import { Apple, History, Settings, Utensils } from 'lucide-react'
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { hasMealDraft } from '../lib/mealDraftStorage.ts'

const sections = [
  { to: '/', label: 'Inicio', Icon: Utensils },
  { to: '/foods', label: 'Alimentos', Icon: Apple },
  { to: '/history', label: 'Historial', Icon: History },
  { to: '/settings', label: 'Configuración', Icon: Settings },
]

/** The bar at the bottom: a screen over everything makes it inert. */
export const APP_NAV_ID = 'app-nav'

export function AppLayout() {
  // Read again on every navigation (this layout renders again when the
  // location changes): leaving Inicio, the meal it kept is already stored.
  const { pathname } = useLocation()
  // The dot on Inicio (UX-20): a meal left half entered. Not on Inicio
  // itself, where the meal is in sight.
  const mealInProgress = pathname !== '/' && hasMealDraft()
  // The chart of the glucose opens from Inicio and goes back to it, so
  // Inicio stays marked there (UX-40), as a detail marks its tab.
  const marked = (to: string, isActive: boolean) =>
    isActive || (to === '/' && pathname.startsWith('/glucose'))

  return (
    <>
      {/* A new screen opens at the top, and going back restores the scroll
          (for example, a meal opened from far down the history). Rendered
          once; in data mode it renders nothing. */}
      <ScrollRestoration />
      <main className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(24px+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      {/* Icon and label (UX-20). The bar does not grow with the letter of
          the iPhone (UX-27), like the bars of iOS. */}
      <nav
        id={APP_NAV_ID}
        className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-md">
          {sections.map(({ to, label, Icon }) => (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-[13px] font-medium ${
                    marked(to, isActive) ? 'text-ink' : 'text-ink-soft'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`relative flex h-8 w-14 items-center justify-center rounded-full motion-safe:transition-colors motion-safe:duration-200 ${
                        marked(to, isActive) ? 'bg-accent-soft text-accent' : ''
                      }`}
                    >
                      <Icon aria-hidden="true" className="size-6" />
                      {to === '/' && mealInProgress && (
                        <span
                          aria-hidden="true"
                          className="absolute top-0.5 right-3 size-2.5 rounded-full bg-accent ring-2 ring-surface"
                        />
                      )}
                    </span>
                    <span className="max-w-full truncate">{label}</span>
                    {to === '/' && mealInProgress && (
                      <span className="sr-only">
                        , con una comida sin guardar
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
