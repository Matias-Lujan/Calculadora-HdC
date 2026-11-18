import { Check } from 'lucide-react'

export type LabelProgressStep = 'preparing' | 'uploading' | 'reading'

const STEPS: { step: LabelProgressStep; label: string; announced: string }[] = [
  {
    step: 'preparing',
    label: 'Preparando',
    announced: 'Preparando la foto…',
  },
  { step: 'uploading', label: 'Subiendo', announced: 'Subiendo la foto…' },
  {
    step: 'reading',
    label: 'Leyendo la etiqueta',
    announced: 'Leyendo la etiqueta… Puede tardar unos segundos.',
  },
]

/**
 * The wait of the photo (spec §6.1, UX-16): the three steps in sight, the
 * current one highlighted and the ones done with a check. The current step
 * is announced in words.
 */
export function LabelProgress({ current }: { current: LabelProgressStep }) {
  const currentIndex = STEPS.findIndex(({ step }) => step === current)
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {STEPS.map(({ step, label }, index) => {
          const done = index < currentIndex
          const isCurrent = index === currentIndex
          return (
            <li
              key={step}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex items-center gap-3 ${isCurrent ? 'font-semibold text-ink' : 'text-ink-soft'}`}
            >
              <span
                aria-hidden="true"
                className={`flex size-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${isCurrent ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-soft'}`}
              >
                {done ? <Check className="size-4" /> : index + 1}
              </span>
              {label}
            </li>
          )
        })}
      </ol>
      <p aria-live="polite" className="text-sm text-ink-soft">
        {STEPS[currentIndex]?.announced}
      </p>
    </div>
  )
}
