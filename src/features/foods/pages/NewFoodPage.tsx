import { Link } from 'react-router'
import { FoodForm } from '../components/FoodForm.tsx'

export function NewFoodPage() {
  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/foods"
        className="flex min-h-11 items-center self-start text-slate-700"
      >
        ← Catálogo
      </Link>
      <FoodForm mode="create" />
    </section>
  )
}
