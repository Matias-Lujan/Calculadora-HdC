import { useId, useState } from 'react'
import { DisclosureIcon } from '../../../components/DisclosureIcon.tsx'
import { disclosure } from '../../../components/styles.ts'

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
        className={`${disclosure} text-sm`}
        onClick={() => setOpen((current) => !current)}
      >
        <DisclosureIcon open={open} />
        {open ? 'Ocultar la cuenta' : 'Ver la cuenta'}
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-0.5 text-sm tabular-nums">
          {lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      )}
    </div>
  )
}
