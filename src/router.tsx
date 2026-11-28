import { createBrowserRouter } from 'react-router'
import {
  RootErrorBoundary,
  RouteErrorBoundary,
} from './components/RouteErrorBoundary.tsx'
import { RequireAuth } from './features/auth/components/RequireAuth.tsx'
import { LoginPage } from './features/auth/pages/LoginPage.tsx'
import { FoodDetailPage } from './features/foods/pages/FoodDetailPage.tsx'
import { EditFoodPage } from './features/foods/pages/EditFoodPage.tsx'
import { FoodsPage } from './features/foods/pages/FoodsPage.tsx'
import { NewFoodPage } from './features/foods/pages/NewFoodPage.tsx'
import { NewLabelFoodPage } from './features/foods/pages/NewLabelFoodPage.tsx'
import { GlucoseChartPage } from './features/meals/pages/GlucoseChartPage.tsx'
import { HistoryPage } from './features/meals/pages/HistoryPage.tsx'
import { MealDetailPage } from './features/meals/pages/MealDetailPage.tsx'
import { NewMealPage } from './features/meals/pages/NewMealPage.tsx'
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
      {
        index: true,
        Component: NewMealPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'foods',
        Component: FoodsPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'foods/new',
        Component: NewFoodPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'foods/label',
        Component: NewLabelFoodPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'foods/:foodId',
        Component: FoodDetailPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'foods/:foodId/edit',
        Component: EditFoodPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'history',
        Component: HistoryPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'history/:mealId',
        Component: MealDetailPage,
        ErrorBoundary: RouteErrorBoundary,
      },
      {
        path: 'glucose',
        Component: GlucoseChartPage,
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
