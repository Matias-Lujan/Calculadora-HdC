import { X } from 'lucide-react'
import { useRef } from 'react'

type Props = {
  url: string
}

/**
 * The photo of the label in "Revisá los datos" (spec §6.1, UX-16): stuck to
 * the top, a third of the screen tall, while the fields are filled, so the
 * portion and the carbs can be compared with it. A tap shows it whole, over
 * the whole screen, until "Cerrar" (or Escape).
 */
export function StickyLabelPhoto({ url }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  return (
    <>
      <div className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 bg-paper px-4 py-2">
        <button
          type="button"
          aria-label="Ver la foto entera"
          aria-haspopup="dialog"
          className="flex w-full justify-center rounded-control bg-sunken"
          onClick={() => dialogRef.current?.showModal()}
        >
          <img
            src={url}
            alt="Foto de la etiqueta"
            className="h-[22svh] w-full rounded-control object-contain"
          />
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-label="Foto de la etiqueta"
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-ink p-0 backdrop:bg-ink"
      >
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-end p-2">
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-control px-3 font-medium text-paper focus-visible:outline-paper"
              onClick={() => dialogRef.current?.close()}
            >
              <X aria-hidden="true" className="shrink-0" />
              Cerrar
            </button>
          </div>
          <img
            src={url}
            alt="Foto de la etiqueta, entera"
            className="min-h-0 w-full flex-1 object-contain"
          />
        </div>
      </dialog>
    </>
  )
}
