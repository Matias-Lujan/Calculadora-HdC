// Builds the USDA seed migration of reference_foods (spec §5.2, §14 #50)
// from the curated list (selection.json) and the SR Legacy CSV files
// (April 2018). The CSV files are public (CC0 1.0) but are not committed:
// download them from https://fdc.nal.usda.gov/download-datasets and unzip
// them into scripts/usda-seed/data/.
//
// Run: node scripts/usda-seed/build.ts <folder with the CSV files> <output .sql>
//
// The output has to be a new migration (`npx supabase migration new
// reference_foods_usda_seed`, which creates it empty) or a preview file. It
// never overwrites a file with content: an applied migration is not edited
// (CLAUDE.md, rule 6).

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  CARBS_NUTRIENT_ID,
  FIBER_NUTRIENT_ID,
  buildRows,
  parseCsvLine,
  parseSelection,
  toSeedSql,
  type NutrientAmount,
} from './seed.ts'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const [csvDirArg, outputFileArg] = process.argv.slice(2)
if (!csvDirArg || !outputFileArg) {
  fail(
    'Uso: node scripts/usda-seed/build.ts <carpeta con los CSV> <archivo .sql de salida>',
  )
}
const csvDir: string = csvDirArg
const outputFile: string = outputFileArg
if (existsSync(outputFile) && statSync(outputFile).size > 0) {
  fail(
    `${outputFile} ya existe y no está vacío. Una migración aplicada no se pisa: creá una nueva con npx supabase migration new.`,
  )
}

/**
 * Reads a CSV file and calls `onRow` with each data row, as a function from
 * column name to value. Fails if a column is missing or a line is malformed.
 */
function readCsv(
  file: string,
  columns: readonly string[],
  onRow: (get: (column: string) => string) => void,
) {
  const fullPath = path.join(csvDir, file)
  if (!existsSync(fullPath)) fail(`No se encontró ${fullPath}`)
  const lines = readFileSync(fullPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
  const parse = (index: number): string[] => {
    try {
      return parseCsvLine(lines[index] ?? '')
    } catch (error) {
      return fail(
        `${file}, línea ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  const header = parse(0)
  const positions = new Map<string, number>()
  for (const column of columns) {
    const position = header.indexOf(column)
    if (position === -1) fail(`${file}: falta la columna "${column}"`)
    positions.set(column, position)
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '') continue
    const fields = parse(i)
    if (fields.length !== header.length) {
      fail(
        `${file}, línea ${i + 1}: tiene ${fields.length} campos y el encabezado ${header.length}`,
      )
    }
    onRow((column) => fields[positions.get(column) ?? -1] ?? '')
  }
}

const selection = (() => {
  const file = path.join(import.meta.dirname, 'selection.json')
  try {
    return parseSelection(JSON.parse(readFileSync(file, 'utf8')))
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
})()
const selectedIds = new Set(selection.map((entry) => entry.fdc_id))

const expectedNutrients = new Map([
  [String(CARBS_NUTRIENT_ID), 'Carbohydrate, by difference'],
  [String(FIBER_NUTRIENT_ID), 'Fiber, total dietary'],
])
const foundNutrients = new Set<string>()
readCsv('nutrient.csv', ['id', 'name', 'unit_name'], (get) => {
  const expected = expectedNutrients.get(get('id'))
  if (expected === undefined) return
  if (get('name') !== expected || get('unit_name') !== 'G') {
    fail(
      `nutrient.csv: el nutriente ${get('id')} es "${get('name')}" (${get('unit_name')}), se esperaba "${expected}" (G)`,
    )
  }
  foundNutrients.add(get('id'))
})
for (const id of expectedNutrients.keys()) {
  if (!foundNutrients.has(id)) fail(`nutrient.csv: falta el nutriente ${id}`)
}

const foods = new Map<number, string>()
readCsv('food.csv', ['fdc_id', 'description'], (get) => {
  const id = Number(get('fdc_id'))
  if (selectedIds.has(id)) foods.set(id, get('description'))
})

const nutrients: NutrientAmount[] = []
readCsv('food_nutrient.csv', ['fdc_id', 'nutrient_id', 'amount'], (get) => {
  const fdcId = Number(get('fdc_id'))
  const nutrientId = Number(get('nutrient_id'))
  if (!selectedIds.has(fdcId)) return
  if (nutrientId !== CARBS_NUTRIENT_ID && nutrientId !== FIBER_NUTRIENT_ID) {
    return
  }
  nutrients.push({ fdcId, nutrientId, amount: get('amount') })
})

const rows = (() => {
  try {
    return buildRows(selection, foods, nutrients)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
})()

writeFileSync(outputFile, toSeedSql(rows), 'utf8')

// Public USDA values, not user data: printing them is fine.
const width = Math.max(...rows.map((row) => row.nameEs.length))
console.log(`${rows.length} alimentos → ${outputFile}\n`)
console.log(`${'Nombre'.padEnd(width)}  Total  Fibra     HC`)
for (const row of rows) {
  console.log(
    `${row.nameEs.padEnd(width)}  ${String(row.totalCarbsPer100g).padStart(5)}  ${String(row.fiberPer100g).padStart(5)}  ${row.carbsPer100g.toFixed(2).padStart(5)}`,
  )
}
