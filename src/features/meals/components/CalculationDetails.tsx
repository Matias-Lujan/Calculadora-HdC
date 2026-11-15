import { useId, useState } from 'react'

type Props = {
  /** The lines of the calculation, already formatted (breakdown.ts). */
  lines: readonly string[]
}

/**
 * The calculation of an item or of the total, folded under "Ver la cuenta"
 * (spec §6.6, §14 #52): closed by default, the same pattern as "Más
 * opciones" of the food form. Nothing is rendered without lines.
 */
export function CalculationDetails({ lines }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (lines.length === 0) return null
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-11 items-center gap-2 self-start text-sm font-medium text-slate-700"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {open ? 'Ocultar la cuenta' : 'Ver la cuenta'}
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-0.5 text-sm text-slate-700">
          {lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      )}
    </div>
  )
}
