import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { backLink } from '../../../components/styles.ts'
import { FoodForm } from '../components/FoodForm.tsx'

export function NewFoodPage() {
  return (
    <section className="flex flex-col gap-4">
      <Link to="/foods" className={backLink}>
        <ChevronLeft aria-hidden="true" className="shrink-0" />
        Mis alimentos
      </Link>
      <FoodForm mode="create" />
    </section>
  )
}
