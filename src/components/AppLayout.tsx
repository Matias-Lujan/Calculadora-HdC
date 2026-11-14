import { NavLink, Outlet, ScrollRestoration } from 'react-router'

const sections = [
  { to: '/', label: 'Inicio' },
  { to: '/foods', label: 'Catálogo' },
  { to: '/history', label: 'Historial' },
  { to: '/settings', label: 'Configuración' },
]

export function AppLayout() {
  return (
    <>
      {/* A new screen opens at the top, and going back restores the scroll
          (for example, a meal opened from far down the history). Rendered
          once; in data mode it renders nothing. */}
      <ScrollRestoration />
      <main className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] text-slate-900">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-md">
          {sections.map(({ to, label }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex min-h-14 items-center justify-center px-1 text-sm ${
                    isActive ? 'font-semibold text-slate-900' : 'text-slate-500'
                  }`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
