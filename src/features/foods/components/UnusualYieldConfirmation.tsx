import { useRef } from 'react'
import { Confirmation } from '../../../components/Confirmation.tsx'
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
 * (spec §6.1). One confirmation for both, with the text of each one that
 * applies. It takes the place of "Guardar" and "Cancelar" while it is open;
 * "Revisar" is the main button, goes first and gets the focus; "Guardar
 * igual", the risky one, is secondary (docs/ux/revision-1.md UX-03).
 */
export function UnusualYieldConfirmation({
  text,
  disabled,
  onConfirm,
  onReview,
}: Props) {
  const reviewButtonRef = useRef<HTMLButtonElement>(null)
  return (
    <Confirmation focusRef={reviewButtonRef}>
      <p>{text}</p>
      <div className="flex flex-col gap-3">
        <button
          ref={reviewButtonRef}
          type="button"
          className={`${button.primary} w-full`}
          onClick={onReview}
        >
          Revisar
        </button>
        <button
          type="button"
          className={`${button.secondary} w-full`}
          disabled={disabled}
          onClick={onConfirm}
        >
          Guardar igual
        </button>
      </div>
    </Confirmation>
  )
}
