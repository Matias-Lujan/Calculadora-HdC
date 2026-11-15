import {
  formatCarbs,
  formatUserNumber,
  parseNonNegativeUserNumber,
  parsePositiveUserNumber,
} from '../../domain/dose/index.ts'
import {
  isMercosurCarbsLabel,
  labelCarbsPer100g,
  parseLabelNumber,
  singleUnitLabel,
  type LabelCarbsBasis,
} from '../../domain/label/index.ts'
import type { FoodFieldError } from '../../lib/errors.ts'
import {
  validateCommonFields,
  type CommonFoodErrors,
  type CommonFoodTexts,
} from './foodForm.ts'
import type {
  TranscribedField,
  Transcription,
  TranscriptionColumn,
} from './transcription.ts'
import type { FoodFormValues, NewFood } from './types.ts'

// Pure logic of the label confirmation (spec §6.1, §9.7). It does no math
// of its own: the numbers go through src/domain/label and src/domain/dose.

/** What the confirmation fields hold, as typed. */
export type LabelFormTexts = CommonFoodTexts & {
  /** The chosen column of the transcription, by index. */
  column: number | null
  /** Whether the carbs are per portion or per 100 g; null = not chosen. */
  basis: LabelCarbsBasis | null
  portion: string
  /** The carbs as printed: per portion or per 100 g, according to basis. */
  labelCarbs: string
  /** The fiber to subtract, in the same basis (only with the warning). */
  fiber: string
}

export type LabelFormErrors = CommonFoodErrors &
  Partial<
    Record<
      'column' | 'basis' | 'portion' | 'labelCarbs' | 'fiber',
      FoodFieldError
    >
  >

export type LabelFormResult = {
  /** null when there is any error. */
  values: FoodFormValues | null
  errors: LabelFormErrors
}

/** A legible text, or null. */
function legibleText(field: TranscribedField): string | null {
  return field.status === 'legible' ? field.text : null
}

/**
 * The number of a transcribed field as the field starts with it: the
 * parsed number (parseLabelNumber, §9.7) in the format of the number
 * fields, or empty when it is not legible or not a plain number.
 */
export function labelNumberText(field: TranscribedField): string {
  const value = parseLabelNumber(legibleText(field))
  return value === null ? '' : formatUserNumber(value)
}

/** Whether a field starts empty because of the photo (marked in amber). */
export function startsEmpty(field: TranscribedField): boolean {
  return labelNumberText(field) === ''
}

/**
 * The note under a number field (spec §9.7): the original text, or why
 * the field is empty.
 */
export function fieldNote(field: TranscribedField): string {
  if (field.status === 'illegible')
    return 'No se lee en la foto. Completalo vos.'
  if (field.status === 'not_present') {
    return 'La etiqueta no lo trae. Completalo vos.'
  }
  const text = (field.text ?? '').trim()
  return startsEmpty(field)
    ? `En la etiqueta dice "${text}". Completalo vos.`
    : `En la etiqueta: "${text}"`
}

/** The note under the name when it was not read from the photo. */
export function nameNote(transcription: Transcription | null): string | null {
  if (transcription === null) return null
  return transcription.product_name.status === 'legible'
    ? null
    : 'No se ve en la foto. Escribilo.'
}

/** The fields a column fills in when it is chosen. */
export function chooseColumn(
  column: TranscriptionColumn,
  index: number,
): Pick<
  LabelFormTexts,
  'column' | 'basis' | 'portion' | 'labelCarbs' | 'fiber'
> {
  return {
    column: index,
    basis: column.basis === 'unknown' ? null : column.basis,
    portion: labelNumberText(column.portion_size_g),
    labelCarbs: labelNumberText(column.carbohydrates_g),
    fiber: '',
  }
}

/**
 * The texts the confirmation starts with. The name and brand, if legible.
 * With a single column, that one is chosen; with several (or none), none.
 * Without a transcription (loaded by hand), everything empty.
 */
export function initialLabelFormTexts(
  transcription: Transcription | null,
): LabelFormTexts {
  const empty: LabelFormTexts = {
    name: '',
    brand: '',
    state: null,
    rawWeight: '',
    cookedWeight: '',
    unitWeight: '',
    unitLabel: '',
    notes: '',
    column: null,
    basis: null,
    portion: '',
    labelCarbs: '',
    fiber: '',
  }
  if (transcription === null) return empty
  const texts = {
    ...empty,
    name: legibleText(transcription.product_name)?.trim() ?? '',
    brand: legibleText(transcription.brand)?.trim() ?? '',
  }
  const [only, ...rest] = transcription.columns
  if (only === undefined || rest.length > 0) return texts
  return { ...texts, ...chooseColumn(only, 0) }
}

/** The chosen column, if any. */
export function chosenColumn(
  texts: Pick<LabelFormTexts, 'column'>,
  transcription: Transcription | null,
): TranscriptionColumn | null {
  if (texts.column === null || transcription === null) return null
  return transcription.columns[texts.column] ?? null
}

/** Whether the screen asks "¿Qué columna usás?": with several columns. */
export function asksColumn(transcription: Transcription | null): boolean {
  return transcription !== null && transcription.columns.length > 1
}

/**
 * Whether the screen asks if the carbs are per portion or per 100 g: when
 * loaded by hand, when no column was read, or when the chosen column does
 * not say.
 */
export function asksBasis(
  texts: Pick<LabelFormTexts, 'column'>,
  transcription: Transcription | null,
): boolean {
  if (transcription === null || transcription.columns.length === 0) return true
  return chosenColumn(texts, transcription)?.basis === 'unknown'
}

/** The original text of a field, for the column options. */
function originalText(field: TranscribedField): string {
  if (field.status === 'illegible') return 'no se lee'
  if (field.status === 'not_present') return 'no figura'
  return (field.text ?? '').trim()
}

/**
 * The option of a column (spec §6.1): its header ("Columna 2" if none),
 * the state text in parentheses and the original portion and carbs.
 */
export function columnOptionText(
  column: TranscriptionColumn,
  index: number,
): string {
  const header = column.header_text?.trim() || `Columna ${index + 1}`
  const state = column.state_text?.trim()
  const parts = [state ? `${header} (${state})` : header]
  if (column.portion_size_g.status !== 'not_present') {
    const description = legibleText(column.portion_description)?.trim()
    const portion = originalText(column.portion_size_g)
    parts.push(
      `porción: ${description ? `${portion} (${description})` : portion}`,
    )
  }
  parts.push(`HC: ${originalText(column.carbohydrates_g)}`)
  return parts.join(' · ')
}

/**
 * Whether the screen warns that the carbs may include the fiber: the
 * carbohydrate row name is legible and not a Mercosur one (spec §5.3).
 */
export function needsFiberWarning(
  transcription: Transcription | null,
): boolean {
  if (transcription === null) return false
  const label = legibleText(transcription.carbohydrate_row_label)
  return label !== null && !isMercosurCarbsLabel(label)
}

/** The printed name of the carbohydrate row, for the fiber warning. */
export function carbsRowText(transcription: Transcription | null): string {
  if (transcription === null) return ''
  return legibleText(transcription.carbohydrate_row_label)?.trim() ?? ''
}

type ParsedNumbers = {
  basis: LabelCarbsBasis
  carbs: number
  portion: number | null
  /** null = no fiber typed (or the field is hidden). */
  fiber: number | null
}

/**
 * The typed numbers, with their errors. Only the fields on screen: the
 * portion only per portion, the fiber only with the warning.
 */
function parseNumbers(
  texts: LabelFormTexts,
  fiberShown: boolean,
  errors: LabelFormErrors,
): ParsedNumbers | null {
  if (texts.basis === null) return null
  const own: LabelFormErrors = {}

  let portion: number | null = null
  if (texts.basis === 'per_portion') {
    const parsed = parsePositiveUserNumber(texts.portion)
    if ('error' in parsed) own.portion = parsed.error
    else portion = parsed.value
  }

  const carbs = parseNonNegativeUserNumber(texts.labelCarbs)
  if ('error' in carbs) own.labelCarbs = carbs.error

  let fiber: number | null = null
  if (fiberShown && texts.fiber.trim() !== '') {
    const parsed = parseNonNegativeUserNumber(texts.fiber)
    if ('error' in parsed) own.fiber = parsed.error
    else fiber = parsed.value
  }

  Object.assign(errors, own)
  if (Object.keys(own).length > 0 || 'error' in carbs) return null
  return { basis: texts.basis, carbs: carbs.value, portion, fiber }
}

/**
 * The carbs per 100 g of the typed numbers (labelCarbsPer100g), or the
 * error of the field to mark.
 */
function carbsPer100g(
  numbers: ParsedNumbers,
  errors: LabelFormErrors,
): number | null {
  const result = labelCarbsPer100g({
    basis: numbers.basis,
    carbsG: numbers.carbs,
    portionG: numbers.portion,
    fiberG: numbers.fiber,
  })
  if (result.ok) return result.carbsPer100g
  switch (result.error) {
    case 'INVALID_PORTION_SIZE':
      errors.portion = 'INVALID_NUMBER'
      break
    case 'INVALID_CARBS':
      errors.labelCarbs = 'INVALID_NUMBER'
      break
    case 'CARBS_EXCEED_PORTION':
      errors.labelCarbs =
        numbers.basis === 'per_portion' ? 'CARBS_EXCEED_PORTION' : 'ABOVE_100'
      break
    case 'INVALID_FIBER':
      errors.fiber = 'INVALID_NUMBER'
      break
    case 'FIBER_EXCEEDS_CARBS':
      errors.fiber = 'FIBER_EXCEEDS_CARBS'
      break
  }
  return null
}

/**
 * The live line of the carbs per 100 g (spec §6.1: the code does the math
 * and shows it): "38 × 100 ÷ 50 = 76,0 g de HC cada 100 g", with the fiber
 * "(38 − 3) × 100 ÷ 50 = …", per 100 g with fiber "78 − 3 = 75,0 g de HC
 * cada 100 g", and " en crudo" for a food that is cooked. The typed numbers
 * as typed, the result with 1 decimal. null while a number is missing or
 * not valid, and per 100 g without fiber (there is nothing to compute).
 */
export function carbsLine(
  texts: LabelFormTexts,
  transcription: Transcription | null,
): string | null {
  const numbers = parseNumbers(texts, needsFiberWarning(transcription), {})
  if (numbers === null) return null
  const result = carbsPer100g(numbers, {})
  if (result === null) return null

  const carbs = formatUserNumber(numbers.carbs)
  const withFiber =
    numbers.fiber === null
      ? carbs
      : `${carbs} − ${formatUserNumber(numbers.fiber)}`
  let math: string
  if (numbers.basis === 'per_portion' && numbers.portion !== null) {
    const portion = formatUserNumber(numbers.portion)
    const top = numbers.fiber === null ? withFiber : `(${withFiber})`
    math = `${top} × 100 ÷ ${portion}`
  } else if (numbers.fiber !== null) {
    math = withFiber
  } else {
    return null
  }
  const raw = texts.state === 'raw_cooked' ? ' en crudo' : ''
  return `${math} = ${formatCarbs(result)} g de HC cada 100 g${raw}`
}

/**
 * The offer to save the portion as the weight of one unit (spec §6.1):
 * only per portion, with a valid portion, for a food eaten as it is, and
 * when the label says the portion is exactly one unit ("1 alfajor"). null
 * otherwise, and once the unit fields already hold it.
 */
export function unitOffer(
  texts: LabelFormTexts,
  transcription: Transcription | null,
): { weightText: string; label: string } | null {
  if (texts.basis !== 'per_portion' || texts.state !== 'as_eaten') return null
  const column = chosenColumn(texts, transcription)
  if (column === null) return null
  const description = legibleText(column.portion_description)
  const label = description === null ? null : singleUnitLabel(description)
  if (label === null) return null
  const portion = parsePositiveUserNumber(texts.portion)
  if ('error' in portion) return null
  const weightText = formatUserNumber(portion.value)
  if (texts.unitWeight === weightText && texts.unitLabel === label) return null
  return { weightText, label }
}

/**
 * Validates the confirmation and returns what to save, or the error of
 * each field. The column is required when there are several; then whether
 * the carbs are per portion or per 100 g; the portion (> 0), the carbs
 * (≥ 0) and the fiber (optional, only with the warning: hidden, it is
 * neither validated nor subtracted) go through labelCarbsPer100g; the rest
 * through validateCommonFields, as in a new food.
 */
export function validateLabelForm(
  texts: LabelFormTexts,
  transcription: Transcription | null,
): LabelFormResult {
  const errors: LabelFormErrors = {}

  let carbs: number | null = null
  if (asksColumn(transcription) && texts.column === null) {
    errors.column = 'COLUMN_REQUIRED'
  } else if (texts.basis === null) {
    errors.basis = 'BASIS_REQUIRED'
  } else {
    const numbers = parseNumbers(
      texts,
      needsFiberWarning(transcription),
      errors,
    )
    if (numbers !== null) carbs = carbsPer100g(numbers, errors)
  }

  const common = validateCommonFields(texts, null, undefined, errors)
  if (common === null || carbs === null) return { values: null, errors }
  return { values: { ...common, carbs_per_100g: carbs }, errors }
}

/**
 * The row to insert for a food from a label (spec §6.1): source label, the
 * photo, and the original transcription as it came (null when it was loaded
 * by hand), even if the user changed the fields.
 */
export function toNewLabelFood(
  values: FoodFormValues,
  photoPath: string,
  transcription: Transcription | null,
): NewFood {
  return {
    ...values,
    source: 'label',
    photo_path: photoPath,
    label_transcription: transcription,
  }
}
