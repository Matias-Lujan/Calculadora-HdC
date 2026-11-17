import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { button } from '../../../components/styles.ts'
import { DELETE_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { formatEatenAt } from '../eatenAt.ts'
import { useDeleteMeal } from '../queries.ts'
import type { SavedMeal } from '../types.ts'

type Props = {
  meal: SavedMeal
}

// "Borrar" in the meal detail (spec §6.7, §14 #47): a soft delete, asked
// for in an inline box (like ArchiveFoodSection). There is no way to
// recover a deleted meal. No lock against a double tap: deleting again only
// overwrites the date.
export function DeleteMealSection({ meal }: Props) {
  const del = useDeleteMeal()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`${button.dangerText} self-start`}
      >
        <Trash2 aria-hidden="true" />
        Borrar
      </button>
    )
  }

  // mutateAsync instead of mutate's onSuccess, like ArchiveFoodSection: the
  // navigation does not depend on the section still being mounted (mutate's
  // per-call callbacks don't run once the component is unmounted, for
  // example if the detail is read again meanwhile and the meal is gone).
  // The navigate from the data router keeps working after unmount.
  function handleConfirm() {
    void del.mutateAsync(meal.id).then(
      () => navigate('/history', { replace: true }),
      () => {}, // the error is shown from del.isError
    )
  }

  function handleCancel() {
    setConfirming(false)
    del.reset()
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-danger bg-danger-soft p-4">
      <p>
        ¿Borrar la comida del {formatEatenAt(meal.eaten_at)}? Deja de aparecer
        en el historial y no se puede deshacer.
      </p>
      {del.isError && (
        <div role="alert">
          <FieldMessage>{DELETE_ERROR_MESSAGE}</FieldMessage>
        </div>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={del.isPending}
          className={button.danger}
        >
          <Trash2 aria-hidden="true" />
          {del.isPending ? 'Borrando…' : 'Borrar'}
        </button>
        {/* Disabled while deleting: the request is already sent and can't be
            undone, so "Cancelar" would only hide it before the navigation. */}
        <button
          type="button"
          onClick={handleCancel}
          disabled={del.isPending}
          className={button.secondary}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
