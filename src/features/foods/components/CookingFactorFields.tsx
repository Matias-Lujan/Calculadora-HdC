import { ArrowRight } from 'lucide-react'
import { NumberInput } from '../../../components/NumberInput.tsx'
import { card } from '../../../components/styles.ts'
import { cookedPer100gText } from '../../../lib/foodText.ts'
import {
  yieldLine,
  type CommonFoodErrors,
  type CommonFoodTexts,
} from '../foodForm.ts'
import { FieldError } from './FormControls.tsx'

type WeightField = 'rawWeight' | 'cookedWeight'

type Props = {
  texts: Pick<CommonFoodTexts, WeightField>
  errors: Pick<CommonFoodErrors, WeightField | 'measuredFactor'>
  /** The factor of the food being edited; null for a new food. */
  savedCookingFactor: number | null
  onChange: (patch: Partial<Pick<CommonFoodTexts, WeightField>>) => void
  onBlur: (field: WeightField) => void
}

/**
 * How much a raw_cooked food yields when cooked (spec §6.4): the raw and
 * cooked weights. Both empty keep the saved cooking factor.
 */
export function CookingFactorFields({
  texts,
  errors,
  savedCookingFactor,
  onChange,
  onBlur,
}: Props) {
  const liveText = yieldLine(texts)
  const savedText =
    savedCookingFactor === null ? null : cookedPer100gText(savedCookingFactor)
  const measuredErrorId = 'food-measured-factor-error'

  function describedByOf(field: WeightField): string | undefined {
    const ids = [
      errors[field] !== undefined ? `food-${field}-error` : null,
      errors.measuredFactor !== undefined ? measuredErrorId : null,
    ].filter((value) => value !== null)
    return ids.length === 0 ? undefined : ids.join(' ')
  }

  // One field of the row; the unit is written inside it, so its label is
  // only for screen readers (UX-24).
  function weightInput(field: WeightField, label: string, suffix: string) {
    const id = `food-${field}`
    const describedBy = describedByOf(field)
    return (
      <div className="flex flex-col">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <NumberInput
          id={id}
          name={field}
          value={texts[field]}
          onValueChange={(value) => onChange({ [field]: value })}
          onBlur={() => onBlur(field)}
          invalid={describedBy !== undefined}
          describedBy={describedBy}
          suffix={suffix}
          boxClassName="w-[8.5rem] max-w-full"
        />
      </div>
    )
  }

  return (
    <section className={`flex flex-col gap-3 ${card}`}>
      <h2 className="font-display text-xl font-semibold">
        Cuánto rinde al cocinarlo
      </h2>
      <p className="text-sm text-ink-soft">
        Pesalo crudo, cocinalo y volvé a pesarlo. Si ya sabés cuánto rinde, poné
        100 en el peso crudo.
      </p>
      {savedText !== null && (
        <p className="text-base">
          Ahora: {savedText}. Para cambiarlo, completá los dos pesos.
        </p>
      )}
      {/* The two weights in one row, as a phrase (UX-24):
          [ 100 ] g crudo → [ 260 ] g cocido. */}
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        {weightInput('rawWeight', 'Peso crudo, en gramos', 'g crudo')}
        <ArrowRight
          aria-hidden="true"
          className="mt-3 shrink-0 text-ink-soft"
        />
        {weightInput('cookedWeight', 'Peso cocido, en gramos', 'g cocido')}
      </div>
      <FieldError
        id="food-rawWeight-error"
        error={errors.rawWeight}
        field="rawWeight"
      />
      <FieldError
        id="food-cookedWeight-error"
        error={errors.cookedWeight}
        field="cookedWeight"
      />
      <FieldError id={measuredErrorId} error={errors.measuredFactor} />
      <p aria-live="polite" className="text-base">
        {liveText}
      </p>
      {savedText === null && (
        <p className="text-sm text-ink-soft">
          Si no sabés cuánto rinde, dejalo vacío y completalo después. Mientras
          tanto, este alimento no se puede usar en una comida.
        </p>
      )}
    </section>
  )
}
