import { z } from 'zod'

// The answer of glucose-latest (docs/spec.md §9.8), shared by the function
// and the app (src/features/meals), so both validate the same shape.

/** The trend arrow of the sensor, from falling fast to rising fast. */
export const GLUCOSE_TRENDS = [
  'falling_fast',
  'falling',
  'steady',
  'rising',
  'rising_fast',
] as const

export type GlucoseTrend = (typeof GLUCOSE_TRENDS)[number]

/**
 * The last reading of the sensor: mg/dL (a whole number, as the sensor
 * gives it), its trend (null if the sensor gives none) and when it was
 * measured (ISO, UTC).
 */
export const readingSchema = z.object({
  mgdl: z.number().int().positive(),
  trend: z.enum(GLUCOSE_TRENDS).nullable(),
  measured_at: z.iso.datetime(),
})

export type GlucoseReading = z.infer<typeof readingSchema>

/** 200: the last reading, or null if the sensor has none right now. */
export const glucoseSuccessSchema = z.object({
  ok: z.literal(true),
  reading: readingSchema.nullable(),
})
