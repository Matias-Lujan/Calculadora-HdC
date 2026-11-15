import { PhotoPickerButton } from './PhotoPickerButton.tsx'

type Props = {
  message: string
  /** What the reading said about the photo, if anything. */
  observation?: string | null
  /** "Cargar a mano": the confirmation with empty fields (spec §9.4). */
  onManual?: () => void
  /** "Reintentar": only when the error can be retried. */
  onRetry?: () => void
  /** "Sacar otra foto". */
  onRetake?: (file: File) => void
  onCancel: () => void
}

/**
 * A failed step of the photo (upload, reading, not a label): the message
 * and the actions that apply (spec §9.4). The photo stays in sight above.
 */
export function LabelReadError({
  message,
  observation = null,
  onManual,
  onRetry,
  onRetake,
  onCancel,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="text-red-700">
        {message}
      </p>
      {observation !== null && (
        <p className="text-sm text-slate-700">{`Al leer la foto: ${observation}`}</p>
      )}
      {onManual !== undefined && (
        <button
          type="button"
          className="min-h-11 rounded-lg bg-slate-900 px-4 text-base font-medium text-white"
          onClick={onManual}
        >
          Cargar a mano
        </button>
      )}
      {onRetry !== undefined && (
        <button
          type="button"
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-base"
          onClick={onRetry}
        >
          Reintentar
        </button>
      )}
      {onRetake !== undefined && (
        <PhotoPickerButton
          label="Sacar otra foto"
          onFile={onRetake}
          variant="secondary"
        />
      )}
      <button
        type="button"
        className="min-h-11 rounded-lg border border-slate-300 px-4 text-base"
        onClick={onCancel}
      >
        Cancelar
      </button>
    </div>
  )
}
