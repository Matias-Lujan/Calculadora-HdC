import { createBrowserRouter } from 'react-router'
import {
  RootErrorBoundary,
  RouteErrorBoundary,
} from './components/RouteErrorBoundary.tsx'
import { RequireAuth } from './features/auth/components/RequireAuth.tsx'
import { LoginPage } from './features/auth/pages/LoginPage.tsx'
import { FoodDetailPage } from './features/foods/pages/FoodDetailPage.tsx'
import { FoodsPage } from './features/foods/pages/FoodsPage.tsx'
import { HistoryPage } from './features/history/pages/HistoryPage.tsx'
import { HomePage } from './features/meals/pages/HomePage.tsx'
import { SettingsPage } from './features/settings/pages/SettingsPage.tsx'

// App wiring: the only file outside the features that imports their pages.
// Protection is done by RequireAuth (component), without loaders.
export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
    ErrorBoundary: RootErrorBoundary,
  },
  {
    Component: RequireAuth,
    ErrorBoundary: RootErrorBoundary,
    children: [
      { index: true, Component: HomePage, ErrorBoundary: RouteErrorBoundary },
      {
        path: 'foods',
        Component: FoodsPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'foods/:foodId',
        Component: FoodDetailPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'history',
        Component: HistoryPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'settings',
        Component: SettingsPage,
        ErrorBoundary: RouteErrorBoundary,
      },
    ],
  },
])
