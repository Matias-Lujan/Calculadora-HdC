import { ChevronLeft } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { backLink } from '../../../components/styles.ts'
import {
  addToMealState,
  isFromMeal,
  nameFromMeal,
} from '../../../lib/mealHandoff.ts'
import { FoodForm } from '../components/FoodForm.tsx'

/**
 * A new food, by hand (spec §6.3). Opened from the search of Inicio
 * ("Agregar a mano", spec §6.6), it starts with what was searched as the
 * name, "← Inicio" and "Cancelar" go back to Inicio, and saving goes back
 * there with the food, which Inicio adds to the meal (like the photo,
 * src/lib/mealHandoff.ts).
 */
export function NewFoodPage() {
  const state: unknown = useLocation().state
  const navigate = useNavigate()
  const fromMeal = isFromMeal(state)
  return (
    <section className="flex flex-col gap-4">
      <Link to={fromMeal ? '/' : '/foods'} className={backLink}>
        <ChevronLeft aria-hidden="true" className="shrink-0" />
        {fromMeal ? 'Inicio' : 'Mis alimentos'}
      </Link>
      {fromMeal ? (
        <FoodForm
          mode="create"
          initialName={nameFromMeal(state)}
          cancelTo="/"
          onSaved={(food) =>
            void navigate('/', { replace: true, state: addToMealState(food) })
          }
        />
      ) : (
        <FoodForm mode="create" />
      )}
    </section>
  )
}
