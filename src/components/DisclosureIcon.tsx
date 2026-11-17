import { ChevronRight } from 'lucide-react'

/**
 * The arrow of something that folds: it points right when closed and turns
 * down when open. Decorative: the button around it says what it does and
 * has aria-expanded.
 */
export function DisclosureIcon({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={`shrink-0 ${open ? 'rotate-90' : ''}`}
    />
  )
}
