import { z } from 'zod'
import { VISION_ERROR_CODES } from '../../lib/errors.ts'
import { transcriptionSchema } from '../../../supabase/functions/transcribe-label/schema.ts'

// The answer of the transcribe-label function (spec §9.3). The transcription
// schema (§9.6) is imported from the function itself, so there is a single
// source: the function validates Gemini's answer with it, and the app
// validates the function's answer with the same one.

export { transcriptionSchema }
export type { Transcription } from '../../../supabase/functions/transcribe-label/schema.ts'

export type TranscriptionColumn = z.infer<
  typeof transcriptionSchema
>['columns'][number]

/** A value copied from the image: legible (with its text) or not. */
export type TranscribedField = TranscriptionColumn['carbohydrates_g']

/** 200: the label was read (it may still not be a nutrition label). */
export const transcribeSuccessSchema = z.object({
  ok: z.literal(true),
  transcription: transcriptionSchema,
})

/**
 * The body of an expected error. A code the app does not know
 * (INTERNAL_ERROR included) does not match: it is an unexpected error.
 */
export const transcribeErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(VISION_ERROR_CODES),
    retryable: z.boolean(),
  }),
})
