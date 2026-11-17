import { X } from 'lucide-react'
import { FieldMessage } from '../../../components/FieldMessage.tsx'
import { InfoTip } from '../../../components/InfoTip.tsx'
import { NumberInput } from '../../../components/NumberInput.tsx'
import {
  button,
  card,
  fieldLabel,
  segmented,
} from '../../../components/styles.ts'
import {
  formatUserNumber,
  type ItemResult,
  type MealItemInput,
  type PositiveNumberError,
  type QuantityMode,
} from '../../../domain/dose/index.ts'
import {
  mealItemErrorMessage,
  positiveNumberErrorMessage,
} from '../../../lib/errors.ts'
import { TABLE_VALUE_INFO, isFromTable } from '../../../lib/foodText.ts'
import { foodLines, itemCalculationLines, itemCarbsText } from '../breakdown.ts'
import { canUseUnits, foodErrors } from '../mealDraft.ts'
import type { MealItemDraft } from '../types.ts'
import { CalculationDetails } from './CalculationDetails.tsx'

type Props = {
  item: MealItemDraft
  input: MealItemInput
  /** The calculation of this item (undefined only if it is missing). */
  result: ItemResult | undefined
  /** The quantity error found on the last blur, or null. */
  shownError: PositiveNumberError | null
  onQuantityChange: (text: string) => void
  onQuantityBlur: () => void
  onModeChange: (mode: QuantityMode) => void
  onRemove: () => void
}

const MODES: { value: QuantityMode; label: string }[] = [
  { value: 'grams', label: 'Gramos' },
  { value: 'units', label: 'Unidades' },
]

function quantityLabel(item: MealItemDraft): string {
  if (item.quantityMode === 'units') return 'Unidades'
  return item.food.state === 'raw_cooked' ? 'Gramos cocidos' : 'Gramos'
}

export function MealItemCard({
  item,
  input,
  result,
  shownError,
  onQuantityChange,
  onQuantityBlur,
  onModeChange,
  onRemove,
}: Props) {
  const { food } = item
  const inputId = `meal-item-${item.key}-quantity`
  const errorId = `${inputId}-error`
  const showError = shownError !== null
  const errors = result === undefined ? [] : foodErrors(result)
  const valid = result !== undefined && result.ok ? result : null
  const carbsText = valid === null ? null : itemCarbsText(valid.carbsG)
  const lines = [
    ...foodLines(food),
    ...(valid === null ? [] : itemCalculationLines(input, valid)),
  ]

  return (
    <li className={`flex flex-col gap-3 ${card}`}>
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
        <button
          type="button"
          className={`${button.text} shrink-0`}
          aria-label={`Quitar ${food.name}`}
          onClick={onRemove}
        >
          <X aria-hidden="true" className="shrink-0" />
          Quitar
        </button>
      </div>

      {canUseUnits(food) && food.unit_weight_g !== null && (
        <div className="flex flex-col gap-1">
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
          <p className="text-sm text-ink-soft">
            {`1 ${food.unit_label ?? 'unidad'} = ${formatUserNumber(food.unit_weight_g)} g`}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className={fieldLabel}>
          {quantityLabel(item)}
        </label>
        <NumberInput
          id={inputId}
          name={inputId}
          value={item.quantityText}
          onValueChange={onQuantityChange}
          onBlur={onQuantityBlur}
          invalid={showError}
          describedBy={showError ? errorId : undefined}
        />
        {shownError !== null && (
          <FieldMessage id={errorId}>
            {positiveNumberErrorMessage(shownError)}
          </FieldMessage>
        )}
      </div>

      {errors.map((code) => (
        <FieldMessage key={code}>{mealItemErrorMessage(code)}</FieldMessage>
      ))}

      {/* In sight, the carbs of the item; the calculation goes folded under
          "Ver la cuenta" (spec §14 #52). */}
      {carbsText !== null && (
        <p className="font-display font-semibold tabular-nums">{carbsText}</p>
      )}
      <CalculationDetails lines={lines} />
    </li>
  )
}
