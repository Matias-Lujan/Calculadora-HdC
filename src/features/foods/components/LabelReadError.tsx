import { Notice } from '../../../components/Notice.tsx'
import { button } from '../../../components/styles.ts'
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
      <Notice tone="error" role="alert">
        <p>{message}</p>
      </Notice>
      {observation !== null && (
        <p className="text-sm text-ink">{`Al leer la foto: ${observation}`}</p>
      )}
      {onManual !== undefined && (
        <button type="button" className={button.primary} onClick={onManual}>
          Cargar a mano
        </button>
      )}
      {onRetry !== undefined && (
        <button type="button" className={button.secondary} onClick={onRetry}>
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
      <button type="button" className={button.secondary} onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}
