import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ARCHIVE_ERROR_MESSAGE } from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import { useArchiveFood } from '../queries.ts'

type Props = {
  food: Food
}

// "Archivar" in the food detail (spec §6.5, §14 #40). Asks for confirmation
// in an inline box; there is no way to unarchive.
export function ArchiveFoodSection({ food }: Props) {
  const archive = useArchiveFood()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 rounded-lg border border-red-300 px-4 text-base font-medium text-red-700"
      >
        Archivar
      </button>
    )
  }

  // mutateAsync instead of mutate's onSuccess: the hook's onSuccess loads the
  // archived row into the detail cache, which unmounts this section, and
  // mutate's per-call callbacks don't run once the component is unmounted.
  // The navigate from the data router keeps working after unmount.
  function handleConfirm() {
    void archive.mutateAsync(food.id).then(
      () => navigate('/foods', { replace: true }),
      () => {}, // the error is shown from archive.isError
    )
  }

  function handleCancel() {
    setConfirming(false)
    archive.reset()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">
      <p>
        ¿Archivar {food.name}? Deja de aparecer en «Mis alimentos» y no vas a
        poder volver a usarlo. Las comidas ya registradas no cambian.
      </p>
      {archive.isError && (
        <p role="alert" className="text-sm text-red-700">
          {ARCHIVE_ERROR_MESSAGE}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={archive.isPending}
          className="min-h-11 rounded-lg bg-red-700 px-4 text-base font-medium text-white disabled:opacity-60"
        >
          {archive.isPending ? 'Archivando…' : 'Archivar'}
        </button>
        {/* Disabled while archiving: the request is already sent and can't be
            undone, so "Cancelar" would only hide it before the navigation. */}
        <button
          type="button"
          onClick={handleCancel}
          disabled={archive.isPending}
          className="min-h-11 rounded-lg border border-red-300 px-4 text-base disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
