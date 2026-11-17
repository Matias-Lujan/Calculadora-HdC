import { CircleAlert, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  id?: string
  /** An error (the default) or a warning about the field. */
  tone?: 'error' | 'warning'
  children: ReactNode
}

/** The short message under a field: an icon and the text, never only a color. */
export function FieldMessage({ id, tone = 'error', children }: Props) {
  const error = tone === 'error'
  const Icon = error ? CircleAlert : TriangleAlert
  return (
    <p
      id={id}
      className={`flex items-start gap-1.5 text-sm ${error ? 'text-danger' : 'text-warning'}`}
    >
      <Icon
        aria-hidden="true"
        className={`shrink-0 ${error ? '' : 'text-warning-line'}`}
      />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
