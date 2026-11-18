import { Info } from 'lucide-react'
import { useId, useState } from 'react'
import { enter } from './styles.ts'

type Props = {
  /** The explanation, in one or two plain sentences (spec §14 #48). */
  text: string
}

/**
 * The ⓘ icon: tapping it shows or hides a short explanation. No hover,
 * popover or portal, so it works the same with a finger on the iPhone.
 * It goes right after a label, inside a `flex flex-wrap` row: the
 * explanation takes the whole width and wraps below the label. The icon
 * takes 20 px, the height of a label line, and its tap area is widened to
 * 44 px by a pseudo-element (UX-24): the row is not taller than one
 * without it.
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
        className="relative inline-flex size-5 items-center justify-center rounded-full text-ink-soft before:absolute before:-inset-3 before:content-['']"
        onClick={() => setOpen((current) => !current)}
      >
        <Info aria-hidden="true" className="size-5" />
      </button>
      <p
        id={id}
        hidden={!open}
        className={`basis-full text-sm text-ink-soft ${enter}`}
      >
        {text}
      </p>
    </>
  )
}
