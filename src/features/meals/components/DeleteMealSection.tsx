import { useState } from 'react'
import { useNavigate } from 'react-router'
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
        className="min-h-11 rounded-lg border border-red-300 px-4 text-base font-medium text-red-700"
      >
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
    <div className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">
      <p>
        ¿Borrar la comida del {formatEatenAt(meal.eaten_at)}? Deja de aparecer
        en el historial y no se puede deshacer.
      </p>
      {del.isError && (
        <p role="alert" className="text-sm text-red-700">
          {DELETE_ERROR_MESSAGE}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={del.isPending}
          className="min-h-11 rounded-lg bg-red-700 px-4 text-base font-medium text-white disabled:opacity-60"
        >
          {del.isPending ? 'Borrando…' : 'Borrar'}
        </button>
        {/* Disabled while deleting: the request is already sent and can't be
            undone, so "Cancelar" would only hide it before the navigation. */}
        <button
          type="button"
          onClick={handleCancel}
          disabled={del.isPending}
          className="min-h-11 rounded-lg border border-red-300 px-4 text-base disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
