import { NumberInput } from '../../../components/NumberInput.tsx'
import {
  measuredFactorLine,
  type FactorMode,
  type FoodFormErrors,
  type FoodFormTexts,
} from '../foodForm.ts'
import { FieldError, RadioGroup } from './FormControls.tsx'

type FactorField = 'rawWeight' | 'cookedWeight' | 'cookingFactor'

type Props = {
  texts: Pick<
    FoodFormTexts,
    'factorMode' | 'rawWeight' | 'cookedWeight' | 'cookingFactor'
  >
  errors: FoodFormErrors
  onChange: (patch: Partial<FoodFormTexts>) => void
  onBlur: (field: FactorField) => void
}

const MODE_OPTIONS: readonly { value: FactorMode; label: string }[] = [
  { value: 'measure', label: 'Medirlo (pesos)' },
  { value: 'direct', label: 'Escribirlo' },
]

/** Cooking factor of a raw_cooked food: measured with weights or typed. */
export function CookingFactorFields({
  texts,
  errors,
  onChange,
  onBlur,
}: Props) {
  const measuredText = measuredFactorLine(texts)
  const measuredErrorId = 'food-measured-factor-error'

  function numberField(field: FactorField, label: string) {
    const id = `food-${field}`
    const error = errors[field]
    const describedBy = [
      error !== undefined ? `${id}-error` : null,
      field !== 'cookingFactor' && errors.measuredFactor !== undefined
        ? measuredErrorId
        : null,
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
      <h2 className="text-base font-semibold">Factor de cocción</h2>
      <RadioGroup
        name="food-factor-mode"
        legend="¿Cómo lo cargás?"
        options={MODE_OPTIONS}
        value={texts.factorMode}
        onChange={(factorMode) => onChange({ factorMode })}
      />

      {texts.factorMode === 'measure' ? (
        <>
          {numberField('rawWeight', 'Peso crudo (g)')}
          {numberField('cookedWeight', 'Peso cocido (g)')}
          <FieldError id={measuredErrorId} error={errors.measuredFactor} />
          <p aria-live="polite" className="text-base">
            {measuredText}
          </p>
        </>
      ) : (
        numberField('cookingFactor', 'Factor (cocido ÷ crudo)')
      )}

      <p className="text-sm text-slate-600">
        Si lo dejás vacío, podés cargarlo después. Sin factor no se puede usar
        en una comida.
      </p>
    </section>
  )
}
