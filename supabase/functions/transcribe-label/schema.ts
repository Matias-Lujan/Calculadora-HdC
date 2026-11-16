import { z } from 'zod'

// Transcription schema from docs/spec.md §9.6. scripts/gemini-probe/probe.ts
// imports it from here.

const fieldStatus = z.enum(['legible', 'illegible', 'not_present'])

/** A value copied verbatim from the image. `text` is null unless legible. */
const transcribedField = z
  .object({
    status: fieldStatus,
    text: z.string().nullable(),
  })
  .refine((field) => (field.status === 'legible') === (field.text !== null), {
    message: 'text must be present only when status is legible',
  })

const column = z.object({
  basis: z.enum(['per_100g', 'per_portion', 'unknown']),
  header_text: z.string().nullable(),
  state: z.enum(['as_sold', 'prepared', 'unspecified']),
  state_text: z.string().nullable(),
  portion_size_g: transcribedField,
  portion_description: transcribedField,
  carbohydrates_g: transcribedField,
  energy: transcribedField,
})

export const transcriptionSchema = z.object({
  is_nutrition_label: z.boolean(),
  product_name: transcribedField,
  brand: transcribedField,
  carbohydrate_row_label: transcribedField,
  columns: z.array(column),
  observations: z.string().nullable(),
})

export type Transcription = z.infer<typeof transcriptionSchema>

/** Same schema as JSON Schema, for the model's structured output. */
export const transcriptionJsonSchema = z.toJSONSchema(transcriptionSchema, {
  target: 'draft-2020-12',
})
