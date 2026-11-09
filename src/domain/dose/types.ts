/** State the carbs-per-100 g value of a food refers to (spec §3). */
export type FoodState = 'as_eaten' | 'raw_cooked'

/** How the quantity of a meal item is entered (spec §6.6). */
export type QuantityMode = 'grams' | 'units'

/** One food in a meal, with the values the calculation needs. */
export interface MealItemInput {
  foodState: FoodState
  /**
   * Available carbs (fiber excluded) per 100 g, in the state given by
   * `foodState`: raw for `raw_cooked` foods. `null` means not entered.
   */
  carbsPer100g: number | null
  /** Cooked weight ÷ raw weight. Only used when `foodState` is `raw_cooked`. */
  cookingFactor: number | null
  /** Weight of one unit, in grams. Only used when `quantityMode` is `units`. */
  unitWeightG: number | null
  quantityMode: QuantityMode
  /**
   * Grams eaten (always as eaten: cooked for `raw_cooked` foods) or number of
   * units, depending on `quantityMode`. `null` means not entered.
   */
  quantity: number | null
}

export interface DoseSettings {
  /** Grams of carbs covered by 1 unit of insulin. */
  carbRatioGPerUnit: number
  /** A dose above this asks for confirmation. `null` means not configured. */
  maxDoseWarningUnits: number | null
  /** An item above this many grams asks for confirmation. */
  maxItemGramsWarning: number
}

/** Errors that block the calculation of one item (spec §8.4). */
export type ItemErrorCode =
  | 'INVALID_QUANTITY'
  | 'INVALID_CARBS'
  | 'MISSING_COOKING_FACTOR'
  | 'INVALID_COOKING_FACTOR'
  | 'MISSING_UNIT_WEIGHT'
  | 'UNITS_NOT_ALLOWED_FOR_RAW_COOKED'
  | 'EFFECTIVE_CARBS_OVER_100'

/** Errors that block the calculation of the whole meal (spec §8.4). */
export type MealErrorCode = 'EMPTY_MEAL' | 'INVALID_RATIO'

/** Warnings that ask for confirmation but do not block (spec §8.5). */
export type ItemWarningCode =
  'ITEM_GRAMS_ABOVE_THRESHOLD' | 'COOKING_FACTOR_UNUSUAL'

export type MealWarningCode = 'DOSE_ABOVE_THRESHOLD'

export interface ItemSuccess {
  ok: true
  /** Grams eaten: the quantity in grams mode, units × unit weight in units mode. */
  grams: number
  /** Carbs per 100 g in the state the food is eaten. */
  effectiveCarbsPer100g: number
  carbsG: number
  warnings: ItemWarningCode[]
}

export interface ItemFailure {
  ok: false
  errors: ItemErrorCode[]
}

export type ItemResult = ItemSuccess | ItemFailure

export interface MealSuccess {
  ok: true
  /** Same order as the input items. */
  items: ItemSuccess[]
  totalCarbsG: number
  /** Exact value, never rounded. Round only for display. */
  doseUnits: number
  /** Meal-level warnings. Item warnings are in each item. */
  warnings: MealWarningCode[]
}

export interface MealFailure {
  ok: false
  /** Same order as the input items, so the UI can show which item failed. */
  items: ItemResult[]
  /** Meal-level errors. Item errors are in each item. */
  errors: MealErrorCode[]
}

export type MealResult = MealSuccess | MealFailure
