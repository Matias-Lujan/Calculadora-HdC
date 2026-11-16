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
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900"
    >
      <p>{text}</p>
      <div className="flex gap-3">
        <button
          type="button"
          className="min-h-11 rounded-lg bg-amber-900 px-4 text-base font-medium text-white disabled:opacity-60"
          disabled={disabled}
          onClick={onConfirm}
        >
          Guardar igual
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-amber-300 px-4 text-base"
          onClick={onReview}
        >
          Revisar
        </button>
      </div>
    </div>
  )
}
