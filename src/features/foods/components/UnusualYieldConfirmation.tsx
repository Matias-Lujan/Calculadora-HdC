import { Notice } from '../../../components/Notice.tsx'
import { button } from '../../../components/styles.ts'

type Props = {
  text: string
  disabled: boolean
  onConfirm: () => void
  onReview: () => void
}

/**
 * The confirmation asked before saving a cooking factor outside 1–4 (spec
 * §6.4) and, from a label, when the carbs do not agree with the calories
 * (spec §6.1), with "Guardar igual" and "Revisar". One confirmation for
 * both, with the text of each one that applies.
 */
export function UnusualYieldConfirmation({
  text,
  disabled,
  onConfirm,
  onReview,
}: Props) {
  return (
    <Notice tone="warning" role="alert">
      <p>{text}</p>
      <div className="flex gap-3">
        <button
          type="button"
          className={button.secondary}
          disabled={disabled}
          onClick={onConfirm}
        >
          Guardar igual
        </button>
        <button type="button" className={button.secondary} onClick={onReview}>
          Revisar
        </button>
      </div>
    </Notice>
  )
}
