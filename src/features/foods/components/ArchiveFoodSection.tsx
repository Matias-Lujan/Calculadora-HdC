import { Archive } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { button } from '../../../components/styles.ts'
import { ARCHIVE_ERROR_MESSAGE } from '../../../lib/errors.ts'
import type { Food } from '../../../lib/foods.ts'
import { useArchiveFood } from '../queries.ts'

type Props = {
  food: Food
}

// "Archivar alimento" in the food detail (spec §6.5, §14 #40). Asks for confirmation
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
        className={`${button.dangerText} self-start`}
      >
        <Archive aria-hidden="true" />
        Archivar alimento
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
    <div className="flex flex-col gap-3 rounded-card border border-danger bg-danger-soft p-4">
      <p>
        ¿Archivar {food.name}? Deja de aparecer en «Mis alimentos» y no vas a
        poder volver a usarlo. Las comidas ya registradas no cambian.
      </p>
      {archive.isError && (
        <div role="alert">
          <FieldMessage>{ARCHIVE_ERROR_MESSAGE}</FieldMessage>
        </div>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={archive.isPending}
          className={button.danger}
        >
          <Archive aria-hidden="true" />
          {archive.isPending ? 'Archivando…' : 'Archivar alimento'}
        </button>
        {/* Disabled while archiving: the request is already sent and can't be
            undone, so "No archivar" would only hide it before the navigation. */}
        <button
          type="button"
          onClick={handleCancel}
          disabled={archive.isPending}
          className={button.secondary}
        >
          No archivar
        </button>
      </div>
    </div>
  )
}
