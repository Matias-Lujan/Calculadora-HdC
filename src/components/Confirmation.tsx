import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Notice } from './Notice.tsx'

type Props = {
  /**
   * The safe button of the box ("Revisar", "No cambiar"): it gets the focus
   * when the box opens.
   */
  focusRef: RefObject<HTMLButtonElement | null>
  children: ReactNode
}

/**
 * An amber confirmation that takes the place of "Guardar" while it is open
 * (docs/ux/revision-1.md UX-03 and UX-04). The button that had the focus
 * goes away, so when the box opens it goes to the middle of the screen (at
 * the bottom edge, the fixed bar would cover it) and the focus goes to its
 * safe button without scrolling again. Whoever closes it gives the focus
 * back to "Guardar".
 */
export function Confirmation({ focusRef, children }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: 'center' })
    focusRef.current?.focus({ preventScroll: true })
  }, [focusRef])
  return (
    <div ref={boxRef}>
      <Notice tone="warning" role="alert">
        {children}
      </Notice>
    </div>
  )
}
