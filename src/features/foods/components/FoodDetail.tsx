import { Pencil, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import { button, pageTitle } from '../../../components/styles.ts'
import { needsCookingFactor } from '../../../domain/dose/index.ts'
import type { Food } from '../../../lib/foods.ts'
import { TABLE_VALUE_INFO, isFromTable } from '../../../lib/foodText.ts'
import { addToMealState } from '../../../lib/mealHandoff.ts'
import {
  foodDetailMainAction,
  foodDetailSentences,
  foodKeyFigure,
} from '../foodDetail.ts'
import { ArchiveFoodSection } from './ArchiveFoodSection.tsx'
import { FoodPhoto } from './FoodPhoto.tsx'

type Props = {
  food: Food
}

/**
 * The detail of a food (spec §6.5, UX-17), in plain words (§14 #52): the
 * carbs every 100 g big, sentences about how it is eaten and its unit, and
 * the buttons, "Usar en una comida" first. It does not show the source, the
 * reference code or the original description. Only a copy from the
 * reference table says where it came from.
 */
export function FoodDetail({ food }: Props) {
  const navigate = useNavigate()
  const figure = foodKeyFigure(food)
  const action = foodDetailMainAction(food)

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className={pageTitle}>{food.name}</h1>
        {food.brand !== null && <p className="text-ink-soft">{food.brand}</p>}
        {food.archived_at !== null && (
          <span className="self-start rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-ink-soft">
            Archivado
          </span>
        )}
        {isFromTable(food) && (
          <div className="flex flex-wrap items-center gap-x-1.5">
            <p className="text-sm text-ink-soft">De la tabla de alimentos</p>
            <InfoTip text={TABLE_VALUE_INFO} />
          </div>
        )}
      </header>

      <div className="flex flex-col gap-2">
        <p>
          <strong className="font-display text-title font-bold tabular-nums">
            {figure.amount}
          </strong>{' '}
          {figure.rest}
        </p>
        {needsCookingFactor(food.state, food.cooking_factor) && (
          <div className="flex flex-col items-start gap-1">
            <MissingFactorBadge />
            <p className="text-sm">
              Cargá cuánto rinde al cocinarlo para poder usarlo en una comida.
            </p>
          </div>
        )}
        {foodDetailSentences(food).map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
        {food.notes !== null && (
          <div>
            <p className="text-sm text-ink-soft">Nota</p>
            <p>{food.notes}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {action === 'use' && (
          // Inicio adds the food at the end of the meal in progress and
          // puts the focus in its quantity (spec §6.6), as after the photo.
          <button
            type="button"
            className={button.primary}
            onClick={() => void navigate('/', { state: addToMealState(food) })}
          >
            <Plus aria-hidden="true" className="shrink-0" />
            Usar en una comida
          </button>
        )}
        {action === 'load-yield' && (
          <Link to={`/foods/${food.id}/edit`} className={button.primary}>
            Cargar cuánto rinde
          </Link>
        )}
        <Link to={`/foods/${food.id}/edit`} className={button.secondary}>
          <Pencil aria-hidden="true" />
          Editar
        </Link>
      </div>

      {food.photo_path !== null && <FoodPhoto path={food.photo_path} />}

      {food.archived_at === null && <ArchiveFoodSection food={food} />}
    </article>
  )
}
