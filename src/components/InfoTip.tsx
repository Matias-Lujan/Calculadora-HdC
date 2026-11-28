import { Info } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ToggleEvent } from 'react'
import { APP_NAV_ID } from './AppLayout.tsx'
import { enter } from './styles.ts'

type Props = {
  /** The explanation, in one or two plain sentences (spec §14 #48). */
  text: string
}

// Space between the icon and the bubble, and from the bubble to the edges
// of the screen, in px.
const GAP = 10
const EDGE = 16

/**
 * The ⓘ icon: tapping it opens a short explanation in a bubble over the
 * screen, pointing to the icon, without moving anything (UX-42). No hover:
 * it works the same with a finger on the iPhone. It is the browser's
 * popover, so the same ⓘ, a tap outside or Escape close it, and it is
 * drawn over everything (no card cuts it). It goes right after a label;
 * the icon takes 20 px, the height of a label line, and its tap area is
 * widened to 44 px by a pseudo-element (UX-24): the row is not taller
 * than one without it. The bubble goes after the button in the page, so
 * VoiceOver reads it right after the ⓘ.
 */
export function InfoTip({ text }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  // With position: fixed it would not follow the icon: a scroll closes it.
  useEffect(() => {
    if (!open) return
    const close = () => tipRef.current?.hidePopover()
    window.addEventListener('scroll', close, { passive: true })
    return () => window.removeEventListener('scroll', close)
  }, [open])

  // Hidden until it is placed, so it is never seen in the middle of the
  // screen (where the browser puts a popover by default).
  const onBeforeToggle = (event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState === 'open') {
      event.currentTarget.style.visibility = 'hidden'
    }
  }

  const onToggle = (event: ToggleEvent<HTMLDivElement>) => {
    const tip = event.currentTarget
    const isOpen = event.newState === 'open'
    setOpen(isOpen)
    if (isOpen && buttonRef.current !== null) {
      place(tip, buttonRef.current)
    }
    tip.style.visibility = ''
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Más información"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        className="relative inline-flex size-5 items-center justify-center rounded-full text-ink-soft before:absolute before:-inset-3 before:content-['']"
      >
        <Info aria-hidden="true" className="size-5" />
      </button>
      <div
        ref={tipRef}
        id={id}
        popover="auto"
        onBeforeToggle={onBeforeToggle}
        onToggle={onToggle}
        className={`group fixed inset-auto m-0 w-max max-w-[min(20rem,calc(100vw-32px))] overflow-visible rounded-control border border-line-raised bg-surface px-3 py-2 text-sm text-ink shadow-level-2 ${enter}`}
      >
        {/* The tip that points to the icon: a square turned 45°, with the
            border only on its two outer sides. */}
        <span
          aria-hidden="true"
          className="absolute left-[calc(var(--tip-x)-5px)] size-2.5 rotate-45 border-line-raised bg-surface group-data-[side=above]:-bottom-1.5 group-data-[side=above]:border-r group-data-[side=above]:border-b group-data-[side=below]:-top-1.5 group-data-[side=below]:border-t group-data-[side=below]:border-l"
        />
        {text}
      </div>
    </>
  )
}

/**
 * Puts the bubble under the icon, centered on it but inside the screen; if
 * it does not fit above the tab bar, over the icon.
 */
function place(tip: HTMLElement, icon: HTMLElement) {
  const anchor = icon.getBoundingClientRect()
  const width = tip.offsetWidth
  const height = tip.offsetHeight
  const center = anchor.left + anchor.width / 2
  const screenWidth = document.documentElement.clientWidth
  const left = Math.max(
    EDGE,
    Math.min(center - width / 2, screenWidth - EDGE - width),
  )
  // The top of the tab bar (it already counts the safe area), or the
  // bottom of the screen where there is none.
  const bar = document.getElementById(APP_NAV_ID)
  const limit = bar?.getBoundingClientRect().top ?? window.innerHeight
  const below = anchor.bottom + GAP + height <= limit
  const top = below ? anchor.bottom + GAP : anchor.top - GAP - height
  tip.style.left = `${left}px`
  tip.style.top = `${top}px`
  tip.style.setProperty('--tip-x', `${center - left}px`)
  tip.dataset.side = below ? 'below' : 'above'
}
