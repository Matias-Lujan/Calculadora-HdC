// Pure functions of the USDA seed (spec §5.2, §14 #50): CSV parsing, the
// curated selection, the rows of reference_foods and the SQL of the
// migration. build.ts does the file reading and writing.

import { z } from 'zod'
import { carbsWithoutFiber } from '../../src/domain/dose/index.ts'
import { normalizeForSearch } from '../../src/lib/search.ts'

/** "Carbohydrate, by difference" (G per 100 g, fiber included). */
export const CARBS_NUTRIENT_ID = 1005
/** "Fiber, total dietary" (G per 100 g). */
export const FIBER_NUTRIENT_ID = 1079

/**
 * Splits one CSV line into its fields. Fields may be quoted (with commas
 * inside and `""` for a quote) or not. Line breaks inside a field are not
 * supported: such a line fails as an unclosed quote.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let i = 0
  for (;;) {
    let value: string
    if (line[i] === '"') {
      value = ''
      i++
      for (;;) {
        const quote = line.indexOf('"', i)
        if (quote === -1) throw new Error('comillas sin cerrar')
        value += line.slice(i, quote)
        if (line[quote + 1] === '"') {
          value += '"'
          i = quote + 2
        } else {
          i = quote + 1
          break
        }
      }
      if (i < line.length && line[i] !== ',') {
        throw new Error('texto después de la comilla de cierre')
      }
    } else {
      const comma = line.indexOf(',', i)
      const end = comma === -1 ? line.length : comma
      value = line.slice(i, end)
      if (value.includes('"')) {
        throw new Error('comilla dentro de un campo sin comillas')
      }
      i = end
    }
    fields.push(value)
    if (i >= line.length) return fields
    i++ // the comma
  }
}

/**
 * A USDA amount ("28.2", "0.000") as a number. Only plain non-negative
 * decimals with a dot are accepted; anything else, including an empty
 * field, is null (an empty amount is "not reported", never 0).
 */
export function parseUsdaAmount(text: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  return Number(text)
}

const selectionSchema = z.array(
  z.strictObject({
    fdc_id: z.number().int().positive(),
    usda_description: z.string().min(1),
    name_es: z.string().min(1),
  }),
)

export type SelectionEntry = z.infer<typeof selectionSchema>[number]

/**
 * Validates the curated list (selection.json). Besides the shape: names
 * without surrounding spaces, and no repeated `fdc_id` or name (names are
 * compared ignoring case and diacritics: "Ananá" and "anana" are the same).
 * Throws with every problem found.
 */
export function parseSelection(raw: unknown): SelectionEntry[] {
  const parsed = selectionSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`La lista no es válida:\n${z.prettifyError(parsed.error)}`)
  }
  const problems: string[] = []
  const ids = new Set<number>()
  const names = new Map<string, string>()
  for (const entry of parsed.data) {
    if (entry.name_es !== entry.name_es.trim()) {
      problems.push(
        `${entry.fdc_id}: el nombre "${entry.name_es}" tiene espacios al principio o al final`,
      )
    }
    if (ids.has(entry.fdc_id)) {
      problems.push(`${entry.fdc_id}: el fdc_id está repetido`)
    }
    ids.add(entry.fdc_id)
    const key = normalizeForSearch(entry.name_es.trim())
    const previous = names.get(key)
    if (previous !== undefined) {
      problems.push(
        `${entry.fdc_id}: el nombre "${entry.name_es}" repite "${previous}"`,
      )
    } else {
      names.set(key, entry.name_es)
    }
  }
  if (problems.length > 0) {
    throw new Error(`La lista no es válida:\n${problems.join('\n')}`)
  }
  return parsed.data
}

/** One row of `food_nutrient.csv`, already reduced to what the seed uses. */
export type NutrientAmount = {
  fdcId: number
  nutrientId: number
  amount: string
}

/** One row of `reference_foods` (spec §7.1). */
export type SeedRow = {
  referenceCode: string
  descriptionOriginal: string
  nameEs: string
  state: 'as_eaten'
  carbsPer100g: number
  totalCarbsPer100g: number
  fiberPer100g: number
}

/**
 * The reference_foods rows of the selection, in its order. `foods` maps
 * each `fdc_id` of `food.csv` to its description. Every problem of every
 * food is collected before failing, so a single run lists them all.
 */
export function buildRows(
  selection: readonly SelectionEntry[],
  foods: ReadonlyMap<number, string>,
  nutrients: readonly NutrientAmount[],
): SeedRow[] {
  const amounts = new Map<string, string[]>()
  for (const n of nutrients) {
    const key = `${n.fdcId}:${n.nutrientId}`
    const list = amounts.get(key)
    if (list) list.push(n.amount)
    else amounts.set(key, [n.amount])
  }

  const problems: string[] = []
  const rows: SeedRow[] = []
  for (const entry of selection) {
    const id = entry.fdc_id
    const description = foods.get(id)
    if (description === undefined) {
      problems.push(`${id}: no está en food.csv`)
      continue
    }
    if (description !== entry.usda_description) {
      problems.push(
        `${id}: la descripción no coincide (lista: "${entry.usda_description}", food.csv: "${description}")`,
      )
      continue
    }
    const amount = (nutrientId: number, label: string): number | null => {
      const list = amounts.get(`${id}:${nutrientId}`)
      if (!list) {
        problems.push(`${id}: no informa ${label} (${nutrientId})`)
        return null
      }
      if (list.length > 1) {
        problems.push(`${id}: ${label} (${nutrientId}) está repetido`)
        return null
      }
      const value = parseUsdaAmount(list[0] ?? '')
      if (value === null) {
        problems.push(
          `${id}: ${label} (${nutrientId}) no es un número válido: "${list[0]}"`,
        )
      }
      return value
    }
    const total = amount(CARBS_NUTRIENT_ID, 'HC totales')
    const fiber = amount(FIBER_NUTRIENT_ID, 'fibra')
    if (total === null || fiber === null) continue
    const carbs = carbsWithoutFiber(total, fiber)
    if (carbs === null) {
      problems.push(
        `${id}: HC totales ${total} y fibra ${fiber} no dan un valor válido`,
      )
      continue
    }
    rows.push({
      referenceCode: String(id),
      descriptionOriginal: description,
      nameEs: entry.name_es,
      state: 'as_eaten',
      carbsPer100g: carbs,
      totalCarbsPer100g: total,
      fiberPer100g: fiber,
    })
  }
  if (problems.length > 0) {
    throw new Error(
      `Hay ${problems.length} problema(s) en la lista:\n${problems.join('\n')}`,
    )
  }
  return rows
}

function sqlText(text: string): string {
  return `'${text.replaceAll("'", "''")}'`
}

function sqlNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`número inválido: ${value}`)
  return String(value)
}

/** The SQL of the seed migration: replaces every USDA row of the table. */
export function toSeedSql(rows: readonly SeedRow[]): string {
  if (rows.length === 0) throw new Error('No hay filas para el seed')
  const values = rows.map(
    (row) =>
      `  ('usda_fdc', ${sqlText(row.referenceCode)}, ${sqlText(row.descriptionOriginal)}, ` +
      `${sqlText(row.nameEs)}, ${sqlText(row.state)}, ${sqlNumber(row.carbsPer100g)}, ` +
      `${sqlNumber(row.totalCarbsPer100g)}, ${sqlNumber(row.fiberPer100g)})`,
  )
  return `-- USDA FoodData Central seed for reference_foods (spec §5.2, §7.1, §14 #50).
-- Generated by scripts/usda-seed/build.ts from scripts/usda-seed/selection.json
-- and SR Legacy (April 2018, CSV). Do not edit: change the selection and
-- generate a new migration (CLAUDE.md, rule 6).
-- Source: U.S. Department of Agriculture, Agricultural Research Service,
-- Beltsville Human Nutrition Research Center. FoodData Central. CC0 1.0.
delete from public.reference_foods where reference_db = 'usda_fdc';
insert into public.reference_foods
  (reference_db, reference_code, description_original, name_es, state,
   carbs_per_100g, total_carbs_per_100g, fiber_per_100g)
values
${values.join(',\n')};
`
}
