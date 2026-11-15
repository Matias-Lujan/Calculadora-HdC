import { NumberInput } from '../../../components/NumberInput.tsx'
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

  function weightField(field: WeightField, label: string) {
    const id = `food-${field}`
    const error = errors[field]
    const describedBy = [
      error !== undefined ? `${id}-error` : null,
      errors.measuredFactor !== undefined ? measuredErrorId : null,
    ]
      .filter((value) => value !== null)
      .join(' ')
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <NumberInput
          id={id}
          name={field}
          value={texts[field]}
          onValueChange={(value) => onChange({ [field]: value })}
          onBlur={() => onBlur(field)}
          invalid={describedBy !== ''}
          describedBy={describedBy === '' ? undefined : describedBy}
        />
        <FieldError id={`${id}-error`} error={error} />
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
      <h2 className="text-base font-semibold">Cuánto rinde al cocinarlo</h2>
      <p className="text-sm text-slate-600">
        Pesalo crudo, cocinalo y volvé a pesarlo. Si ya sabés cuánto rinde, poné
        100 en el peso crudo.
      </p>
      {savedText !== null && (
        <p className="text-base">
          Ahora: {savedText}. Para cambiarlo, completá los dos pesos.
        </p>
      )}
      {weightField('rawWeight', 'Peso crudo (g)')}
      {weightField('cookedWeight', 'Peso cocido (g)')}
      <FieldError id={measuredErrorId} error={errors.measuredFactor} />
      <p aria-live="polite" className="text-base">
        {liveText}
      </p>
      {savedText === null && (
        <p className="text-sm text-slate-600">
          Si no sabés cuánto rinde, dejalo vacío y completalo después. Mientras
          tanto, este alimento no se puede usar en una comida.
        </p>
      )}
    </section>
  )
}
