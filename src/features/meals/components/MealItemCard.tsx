import { X } from 'lucide-react'
import { useId, useState } from 'react'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
import { card, segmented } from '../../../components/styles.ts'
import {
  formatUserNumber,
  type ItemResult,
  type MealItemInput,
  type PositiveNumberError,
  type QuantityMode,
} from '../../../domain/dose/index.ts'
import {
  mealItemErrorMessage,
  quantityErrorMessage,
} from '../../../lib/errors.ts'
import { TABLE_VALUE_INFO, isFromTable } from '../../../lib/foodText.ts'
import { foodLines, itemCalculationLines, itemCarbsText } from '../breakdown.ts'
import { canUseUnits, foodErrors } from '../mealDraft.ts'
import type { MealItemDraft } from '../types.ts'
import { CalculationLines, CalculationToggle } from './CalculationDetails.tsx'

type Props = {
  item: MealItemDraft
  input: MealItemInput
  /** The calculation of this item (undefined only if it is missing). */
  result: ItemResult | undefined
  /** The quantity error found on the last blur, or null. */
  shownError: PositiveNumberError | null
  /**
   * The warnings of the item, already worded (mealLiveWarningMessage). They
   * are shown as soon as the calculation gives them, not on blur.
   */
  warnings: readonly string[]
  onQuantityChange: (text: string) => void
  onQuantityBlur: () => void
  onModeChange: (mode: QuantityMode) => void
  onRemove: () => void
}

// Units first: an item that can be entered in units starts in units.
const MODES: { value: QuantityMode; label: string }[] = [
  { value: 'units', label: 'Unidades' },
  { value: 'grams', label: 'Gramos' },
]

/** The label of the quantity, for screen readers: "Gramos cocidos". */
function quantityLabel(item: MealItemDraft): string {
  if (item.quantityMode === 'units') return 'Unidades'
  return item.food.state === 'raw_cooked' ? 'Gramos cocidos' : 'Gramos'
}

/** The unit written inside the field: "g", "g cocidos" or "unidades". */
function quantitySuffix(item: MealItemDraft): string {
  if (item.quantityMode === 'units') return 'unidades'
  return item.food.state === 'raw_cooked' ? 'g cocidos' : 'g'
}

/**
 * An item of the meal (spec §6.6, UX-05): the name with a ✕ to remove it;
 * the quantity in a narrow field with its unit inside and, on the same line,
 * the carbs it gives with "Ver la cuenta" under them.
 */
export function MealItemCard({
  item,
  input,
  result,
  shownError,
  warnings,
  onQuantityChange,
  onQuantityBlur,
  onModeChange,
  onRemove,
}: Props) {
  const { food } = item
  const [calculationOpen, setCalculationOpen] = useState(false)
  const calculationId = useId()
  const inputId = `meal-item-${item.key}-quantity`
  const errorId = `${inputId}-error`
  const warningId = (index: number) => `${inputId}-warning-${index}`
  const showError = shownError !== null
  const describedBy = [
    ...(showError ? [errorId] : []),
    ...warnings.map((_, index) => warningId(index)),
  ].join(' ')
  const errors = result === undefined ? [] : foodErrors(result)
  const valid = result !== undefined && result.ok ? result : null
  const carbsText = valid === null ? null : itemCarbsText(valid.carbsG)
  const lines = [
    ...foodLines(food),
    ...(valid === null
      ? []
      : itemCalculationLines(input, valid, food.unit_label)),
  ]

  return (
    // tabIndex -1: "Guardar comida" brings the focus here when the problem
    // is the food and not its quantity (spec §6.6).
    <li
      id={`meal-item-${item.key}`}
      tabIndex={-1}
      className={`flex flex-col gap-2 ${card}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          {/* The ⓘ of a table food goes next to its name, always in sight
              (spec §14 #51 (8)). */}
          <div className="flex flex-wrap items-center">
            <span className="font-semibold">{food.name}</span>
            {isFromTable(food) && <InfoTip text={TABLE_VALUE_INFO} />}
          </div>
          {food.brand !== null && (
            <span className="text-sm text-ink-soft">{food.brand}</span>
          )}
        </div>
        {/* No confirmation: Inicio offers "Deshacer" for 5 seconds. */}
        <button
          type="button"
          className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft"
          aria-label={`Quitar ${food.name}`}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </button>
      </div>

      {canUseUnits(food) && (
        <div className={segmented.group}>
          {MODES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={item.quantityMode === value}
              className={`${segmented.option} ${segmented.pressed}`}
              onClick={() => {
                if (item.quantityMode !== value) onModeChange(value)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Only for screen readers: the unit inside the field is not enough
          ("Gramos cocidos de Arroz largo fino"). */}
      <label htmlFor={inputId} className="sr-only">
        {`${quantityLabel(item)} de ${food.name}`}
      </label>
      {/* The field and the carbs on one line. Under the field, in its
          column, the notice of NumberInput and the "1 alfajor = 50 g" hint;
          errors, warnings and the open calculation take the whole width. */}
      <div className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
        <div className="flex flex-col gap-1">
          <NumberInput
            id={inputId}
            name={inputId}
            value={item.quantityText}
            onValueChange={onQuantityChange}
            onBlur={onQuantityBlur}
            invalid={showError}
            describedBy={describedBy === '' ? undefined : describedBy}
            suffix={quantitySuffix(item)}
            className="font-display text-xl font-semibold"
          />
          {canUseUnits(food) && food.unit_weight_g !== null && (
            <p className="text-sm text-ink-soft">
              {`1 ${food.unit_label ?? 'unidad'} = ${formatUserNumber(food.unit_weight_g)} g`}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end text-right">
          {carbsText !== null && (
            <p className="flex min-h-12 items-center font-display text-lg font-semibold tabular-nums">
              {carbsText}
            </p>
          )}
          {/* "Ver la cuenta" under the carbs; the lines go across the card
              (spec §14 #52). */}
          <CalculationToggle
            open={calculationOpen}
            controls={calculationId}
            onToggle={() => setCalculationOpen((current) => !current)}
            className="self-end"
          />
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          {shownError !== null && (
            <FieldMessage id={errorId}>
              {quantityErrorMessage(shownError, item.quantityMode)}
            </FieldMessage>
          )}
          {/* Always in the page, so a warning is announced when it shows
              (WCAG 4.1.3); empty, it takes no room. */}
          <div role="status" className="flex flex-col gap-1 empty:-mt-1">
            {warnings.map((warning, index) => (
              <FieldMessage key={index} id={warningId(index)} tone="warning">
                {warning}
              </FieldMessage>
            ))}
          </div>
          {errors.map((code) => (
            <FieldMessage key={code}>{mealItemErrorMessage(code)}</FieldMessage>
          ))}
        </div>
        {calculationOpen && (
          <CalculationLines
            id={calculationId}
            lines={lines}
            className="col-span-2 pt-1"
          />
        )}
      </div>
    </li>
  )
}
