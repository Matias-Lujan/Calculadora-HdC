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
      <CalculationToggle
        open={open}
        controls={id}
        onToggle={() => setOpen((current) => !current)}
        className="self-start"
      />
      {open && <CalculationLines id={id} lines={lines} />}
    </div>
  )
}

type ToggleProps = {
  open: boolean
  /** The id of the CalculationLines it unfolds. */
  controls: string
  onToggle: () => void
  /** Where it goes in its container (self-start, self-end). */
  className?: string
}

/**
 * "Ver la cuenta" / "Ocultar la cuenta" alone, for a layout that puts the
 * lines somewhere else (the meal item: the button under its carbs, the
 * lines across the card).
 */
export function CalculationToggle({
  open,
  controls,
  onToggle,
  className,
}: ToggleProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      className={`${disclosure} text-sm${className === undefined ? '' : ` ${className}`}`}
      onClick={onToggle}
    >
      <DisclosureIcon open={open} />
      {open ? 'Ocultar la cuenta' : 'Ver la cuenta'}
    </button>
  )
}

export function CalculationLines({
  id,
  lines,
  className,
}: {
  id: string
  lines: readonly string[]
  className?: string
}) {
  return (
    <div
      id={id}
      className={`flex flex-col gap-0.5 text-sm tabular-nums${className === undefined ? '' : ` ${className}`}`}
    >
      {lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  )
}
