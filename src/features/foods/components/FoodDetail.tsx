import { Pencil } from 'lucide-react'
import { Link } from 'react-router'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import { button, pageTitle } from '../../../components/styles.ts'
import {
  formatCarbs,
  formatUserNumber,
  needsCookingFactor,
} from '../../../domain/dose/index.ts'
import type { Food } from '../../../lib/foods.ts'
import {
  TABLE_VALUE_INFO,
  cookedPer100gText,
  isFromTable,
} from '../../../lib/foodText.ts'
import { carbsLabel } from '../foodForm.ts'
import { ArchiveFoodSection } from './ArchiveFoodSection.tsx'
import { FoodPhoto } from './FoodPhoto.tsx'

// The answer to "¿Se cocina antes de comer?", as in the form.
const COOKED_ANSWERS: Record<Food['state'], string> = {
  as_eaten: 'No',
  raw_cooked: 'Sí',
}

type Props = {
  food: Food
}

/**
 * The detail of a food (spec §6.5), in plain words (§14 #52): it does not
 * show the source, the reference code or the original description. Only a
 * copy from the reference table says where it came from.
 */
export function FoodDetail({ food }: Props) {
  const isRawCooked = food.state === 'raw_cooked'

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
          <div className="flex flex-wrap items-center">
            <p className="text-sm text-ink-soft">De la tabla de alimentos</p>
            <InfoTip text={TABLE_VALUE_INFO} />
          </div>
        )}
      </header>

      {food.photo_path !== null && <FoodPhoto path={food.photo_path} />}

      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-sm text-ink-soft">¿Se cocina antes de comer?</dt>
          <dd>{COOKED_ANSWERS[food.state]}</dd>
        </div>

        <div>
          <dt className="text-sm text-ink-soft">{carbsLabel(food.state)}</dt>
          <dd className="font-display tabular-nums">
            {formatCarbs(food.carbs_per_100g)} g
          </dd>
        </div>

        {isRawCooked && (
          <div>
            <dt className="text-sm text-ink-soft">Cuánto rinde al cocinarlo</dt>
            {needsCookingFactor(food.state, food.cooking_factor) ? (
              <dd className="flex flex-col items-start gap-1">
                <MissingFactorBadge />
                <span className="text-sm text-ink">
                  Cargalo con «Editar» para poder usarlo en una comida.
                </span>
              </dd>
            ) : (
              // Not missing here means not null: the check only narrows.
              food.cooking_factor !== null && (
                <dd>
                  {cookedPer100gText(food.cooking_factor) ??
                    'No se puede mostrar. Revisalo con «Editar».'}
                </dd>
              )
            )}
          </div>
        )}

        {food.unit_weight_g !== null && (
          <div>
            <dt className="text-sm text-ink-soft">Peso por unidad</dt>
            <dd>
              {`1 ${food.unit_label ?? 'unidad'} = ${formatUserNumber(food.unit_weight_g)} g`}
            </dd>
          </div>
        )}

        {food.notes !== null && (
          <div>
            <dt className="text-sm text-ink-soft">Nota</dt>
            <dd>{food.notes}</dd>
          </div>
        )}
      </dl>

      <Link to={`/foods/${food.id}/edit`} className={button.secondary}>
        <Pencil aria-hidden="true" />
        Editar
      </Link>

      {food.archived_at === null && <ArchiveFoodSection food={food} />}
    </article>
  )
}
