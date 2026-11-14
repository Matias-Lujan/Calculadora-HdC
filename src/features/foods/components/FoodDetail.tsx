import { Link } from 'react-router'
import { MissingFactorBadge } from '../../../components/MissingFactorBadge.tsx'
import {
  formatCarbs,
  formatCookingFactor,
  formatUserNumber,
  needsCookingFactor,
} from '../../../domain/dose/index.ts'
import type { Food } from '../../../lib/foods.ts'
import { REFERENCE_DB_LABELS } from '../types.ts'
import { ArchiveFoodSection } from './ArchiveFoodSection.tsx'

const SOURCE_LABELS: Record<Food['source'], string> = {
  label: 'Etiqueta',
  reference: 'Tabla de referencia',
  manual: 'Manual',
}

const STATE_LABELS: Record<Food['state'], string> = {
  as_eaten: 'Tal como se come',
  raw_cooked: 'Crudo, se come cocido',
}

type Props = {
  food: Food
}

export function FoodDetail({ food }: Props) {
  const isRawCooked = food.state === 'raw_cooked'

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{food.name}</h1>
        {food.brand !== null && <p className="text-slate-500">{food.brand}</p>}
        {food.archived_at !== null && (
          <span className="self-start rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
            Archivado
          </span>
        )}
      </header>

      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-sm text-slate-500">Fuente</dt>
          <dd>{SOURCE_LABELS[food.source]}</dd>
          {food.source === 'reference' && (
            <>
              {food.reference_db !== null && (
                <dd className="text-sm text-slate-700">
                  {REFERENCE_DB_LABELS[food.reference_db]}
                </dd>
              )}
              {food.reference_code !== null && (
                <dd className="text-sm text-slate-700">
                  Código: {food.reference_code}
                </dd>
              )}
              {food.reference_description !== null && (
                <dd className="text-sm text-slate-700">
                  Descripción original: {food.reference_description}
                </dd>
              )}
            </>
          )}
          {food.notes !== null && (
            <dd className="text-sm text-slate-700">Nota: {food.notes}</dd>
          )}
        </div>

        <div>
          <dt className="text-sm text-slate-500">Estado</dt>
          <dd>{STATE_LABELS[food.state]}</dd>
        </div>

        <div>
          <dt className="text-sm text-slate-500">HC cada 100 g</dt>
          <dd>
            {formatCarbs(food.carbs_per_100g)} g{isRawCooked && ' (crudo)'}
          </dd>
        </div>

        {isRawCooked && (
          <div>
            <dt className="text-sm text-slate-500">Factor de cocción</dt>
            {needsCookingFactor(food.state, food.cooking_factor) ? (
              <dd className="flex flex-col items-start gap-1">
                <MissingFactorBadge />
                <span className="text-sm text-slate-700">
                  Cargalo antes de usar este alimento en una comida.
                </span>
              </dd>
            ) : (
              // Not missing here means not null: the check only narrows.
              food.cooking_factor !== null && (
                <dd>{formatCookingFactor(food.cooking_factor)}</dd>
              )
            )}
          </div>
        )}

        {food.unit_weight_g !== null && (
          <div>
            <dt className="text-sm text-slate-500">Peso por unidad</dt>
            <dd>
              {`1 ${food.unit_label ?? 'unidad'} = ${formatUserNumber(food.unit_weight_g)} g`}
            </dd>
          </div>
        )}
      </dl>

      <Link
        to={`/foods/${food.id}/edit`}
        className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-base font-medium"
      >
        Editar
      </Link>

      {food.archived_at === null && <ArchiveFoodSection food={food} />}
    </article>
  )
}
