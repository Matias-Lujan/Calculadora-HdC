import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'warning' | 'error'

const TONES = {
  /** Neutral: something to know, not a problem. */
  info: {
    Icon: Info,
    box: 'border border-line bg-sunken text-ink',
    icon: 'text-accent',
  },
  success: {
    Icon: CircleCheck,
    box: 'bg-success-soft text-success',
    icon: 'text-success',
  },
  warning: {
    Icon: TriangleAlert,
    box: 'border border-warning-line bg-warning-soft text-warning',
    icon: 'text-warning-line',
  },
  error: {
    Icon: CircleAlert,
    box: 'bg-danger-soft text-danger',
    icon: 'text-danger',
  },
} as const

type Props = {
  tone: Tone
  /** "alert" or "status" when the whole box is announced; otherwise, put it on the part that is. */
  role?: 'alert' | 'status'
  children: ReactNode
}

/**
 * A notice, neutral or of success, warning or error (docs/ux/revision-1.md
 * §2.10): always an icon and text, never only a color.
 */
export function Notice({ tone, role, children }: Props) {
  const { Icon, box, icon } = TONES[tone]
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-card p-4 ${box}`}
    >
      <Icon aria-hidden="true" className={`mt-0.5 shrink-0 ${icon}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  )
}
