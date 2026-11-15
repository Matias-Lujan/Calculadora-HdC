// Prints one line per probe answer in output/, running the transcribed text
// through the same stage 1 code the app will use (parse + per-portion
// conversion), so the result is the number the app would show.
//
// Run: node scripts/gemini-probe/summarize.ts <run>

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  carbsPer100gFromPortion,
  parseLabelNumber,
} from '../../src/domain/label/index.ts'
import {
  transcriptionSchema,
  type Transcription,
} from '../../supabase/functions/transcribe-label/schema.ts'

const [runName = 'v1'] = process.argv.slice(2)
const outputDir = path.join(import.meta.dirname, 'output', runName)

function field(value: { status: string; text: string | null }): string {
  return value.status === 'legible' ? `"${value.text}"` : value.status
}

function describeColumn(column: Transcription['columns'][number]): string {
  const carbs = parseLabelNumber(column.carbohydrates_g.text)
  const portion = parseLabelNumber(column.portion_size_g.text)
  let per100g = '—'
  if (column.basis === 'per_100g' && carbs !== null) {
    per100g = String(carbs)
  } else if (column.basis === 'per_portion') {
    const converted = carbsPer100gFromPortion(carbs, portion)
    per100g = converted.ok ? converted.carbsPer100g.toFixed(2) : converted.error
  }
  return (
    `[${column.basis}/${column.state} header=${JSON.stringify(column.header_text)} ` +
    `porción=${field(column.portion_size_g)} (${field(column.portion_description)}) ` +
    `HC=${field(column.carbohydrates_g)} → HC/100g=${per100g}]`
  )
}

const files = (await readdir(outputDir))
  .filter((f) => f.endsWith('.json'))
  .sort()
for (const file of files) {
  const result = JSON.parse(await readFile(path.join(outputDir, file), 'utf8'))
  const head = `${file.replace('.json', '').padEnd(36)} ${String(result.ms ?? '-').padStart(6)} ms`
  if (result.failure || result.httpStatus !== 200) {
    console.log(
      `${head}  ERROR ${result.failure ?? JSON.stringify(result.apiError)}`,
    )
    continue
  }
  const parsed = transcriptionSchema.safeParse(result.transcription)
  if (!parsed.success) {
    console.log(
      `${head}  ESQUEMA INVÁLIDO ${JSON.stringify(parsed.error.issues).slice(0, 200)}`,
    )
    continue
  }
  const t = parsed.data
  console.log(
    `${head}  nombre=${field(t.product_name)} marca=${field(t.brand)} ` +
      `fila=${field(t.carbohydrate_row_label)}\n    ` +
      t.columns.map(describeColumn).join('\n    ') +
      (t.observations ? `\n    obs: ${t.observations}` : ''),
  )
}
