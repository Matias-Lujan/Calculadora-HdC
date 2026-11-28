import {
  formatCarbs,
  formatUserNumber,
  needsCookingFactor,
} from '../../domain/dose/index.ts'
import type { Food } from '../../lib/foods.ts'
import { cookedPer100gText } from '../../lib/foodText.ts'

// The texts and the main action of the food detail (spec §6.5, UX-17). They
// only format: the numbers go through src/domain/dose.

/**
 * The key figure of a food, big under its name: "78,0 g" and "de HC cada
 * 100 g", or "de HC cada 100 g, en crudo" for a food eaten cooked.
 */
export function foodKeyFigure(food: Pick<Food, 'state' | 'carbs_per_100g'>): {
  amount: string
  rest: string
} {
  return {
    amount: `${formatCarbs(food.carbs_per_100g)} g`,
    rest:
      food.state === 'raw_cooked'
        ? 'de HC cada 100 g, en crudo'
        : 'de HC cada 100 g',
  }
}

/**
 * The sentences under the key figure: how the food is eaten ("Se come tal
 * cual.", or how much it yields cooked, "Al cocinarlo, 100 g crudo rinden
 * 260 g cocido.") and its unit, if it has one ("1 alfajor = 50 g.", exact).
 * A food eaten cooked without how much it yields has no sentence about it:
 * the detail shows the "Falta cuánto rinde" mark instead.
 */
export function foodDetailSentences(
  food: Pick<Food, 'state' | 'cooking_factor' | 'unit_weight_g' | 'unit_label'>,
): string[] {
  const sentences: string[] = []
  if (food.state === 'as_eaten') {
    sentences.push('Se come tal cual.')
  } else if (food.cooking_factor !== null) {
    const yieldText = cookedPer100gText(food.cooking_factor)
    sentences.push(
      yieldText === null
        ? 'No se puede mostrar cuánto rinde al cocinarlo. Revisalo con "Editar".'
        : `Al cocinarlo, ${yieldText}.`,
    )
  }
  if (food.unit_weight_g !== null) {
    sentences.push(
      `1 ${food.unit_label ?? 'unidad'} = ${formatUserNumber(food.unit_weight_g)} g.`,
    )
  }
  return sentences
}

/**
 * The main button of the detail: "Usar en una comida" (`use`); "Cargar
 * cuánto rinde" (`load-yield`) for a food eaten cooked that still needs it,
 * which cannot go in a meal (spec §6.4); none for an archived food, which
 * cannot be used any more.
 */
export function foodDetailMainAction(
  food: Pick<Food, 'state' | 'cooking_factor' | 'archived_at'>,
): 'use' | 'load-yield' | null {
  if (food.archived_at !== null) return null
  return needsCookingFactor(food.state, food.cooking_factor)
    ? 'load-yield'
    : 'use'
}
