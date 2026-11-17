import { Info } from 'lucide-react'
import { useId, useState } from 'react'

type Props = {
  /** The explanation, in one or two plain sentences (spec §14 #48). */
  text: string
}

/**
 * The ⓘ icon: tapping it shows or hides a short explanation. No hover,
 * popover or portal, so it works the same with a finger on the iPhone.
 * It goes right after a label, inside a `flex flex-wrap` row: the
 * explanation takes the whole width and wraps below the label.
 */
export function InfoTip({ text }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <button
        type="button"
        aria-label="Más información"
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex size-11 items-center justify-center rounded-full text-ink-soft"
        onClick={() => setOpen((current) => !current)}
      >
        <Info aria-hidden="true" />
      </button>
      <p id={id} hidden={!open} className="basis-full text-sm text-ink-soft">
        {text}
      </p>
    </>
  )
}
