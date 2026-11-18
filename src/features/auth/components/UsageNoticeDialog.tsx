import { useEffect, useRef } from 'react'
import { Notice } from '../../../components/Notice.tsx'
import { button, card, cardTitle } from '../../../components/styles.ts'
import { SAVE_ERROR_MESSAGE } from '../../../lib/errors.ts'
import { useSettings } from '../../../lib/settings.ts'
import { useAcceptUsageNotice } from '../queries.ts'
import { mustAcceptUsageNotice } from '../usageNotice.ts'

/**
 * The usage notice (plan M7): the first time a user signs in, a window over
 * the whole app until they tap "Entendido". It is saved in their settings,
 * so it does not come back on any phone.
 */
export function UsageNoticeDialog() {
  const settings = useSettings()
  const data = settings.data
  if (data === undefined || !mustAcceptUsageNotice(data)) return null
  return <UsageNoticeWindow userId={data.user_id} />
}

function UsageNoticeWindow({ userId }: { userId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const accept = useAcceptUsageNotice()

  // Modal: the rest of the page (and the bar) is inert while it is open.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog !== null && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="usage-notice-title"
      aria-describedby="usage-notice-text"
      // Escape does not close it: it closes only once it is accepted.
      onCancel={(event) => event.preventDefault()}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-paper p-0 text-ink backdrop:bg-paper"
    >
      <div className="mx-auto flex h-full max-w-md flex-col justify-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className={`${card} flex flex-col gap-4`}>
          <h1 id="usage-notice-title" className={cardTitle}>
            Antes de empezar
          </h1>
          <p id="usage-notice-text">
            Proyecto personal. No es un dispositivo médico y no reemplaza la
            indicación médica. La dosis sale de tu ratio y de los datos que
            cargues: revisalos con tu médico. El uso es bajo tu responsabilidad.
          </p>
          {accept.isError && (
            <Notice tone="error" role="alert">
              <p>{SAVE_ERROR_MESSAGE}</p>
            </Notice>
          )}
          <button
            type="button"
            className={`${button.primary} w-full`}
            disabled={accept.isPending}
            onClick={() => accept.mutate(userId)}
          >
            {accept.isPending ? 'Guardando…' : 'Entendido'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
