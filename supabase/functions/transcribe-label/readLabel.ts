import { INSTRUCTIONS } from './prompt.ts'
import {
  transcribe,
  type ProviderConfig,
  type ProviderError,
} from './provider.ts'
import {
  transcriptionJsonSchema,
  transcriptionSchema,
  type Transcription,
} from './schema.ts'

// Reads a label photo: calls the provider, retries once on UNAVAILABLE and
// validates the answer with zod (docs/spec.md §9.3). No Deno, no Supabase.

export type VisionErrorCode =
  'VISION_QUOTA_EXCEEDED' | 'VISION_UNAVAILABLE' | 'VISION_BAD_RESPONSE'

export type ReadLabelResult =
  | { ok: true; transcription: Transcription }
  | { ok: false; code: VisionErrorCode }

/** Wait before the single retry after UNAVAILABLE (spec §9.3, #26). */
export const RETRY_DELAY_MS = 1000

const CODES: Record<ProviderError, VisionErrorCode> = {
  QUOTA_EXCEEDED: 'VISION_QUOTA_EXCEEDED',
  UNAVAILABLE: 'VISION_UNAVAILABLE',
  TIMEOUT: 'VISION_UNAVAILABLE',
  BLOCKED: 'VISION_BAD_RESPONSE',
  BAD_RESPONSE: 'VISION_BAD_RESPONSE',
}

export async function readLabel(
  image: Uint8Array,
  config: ProviderConfig,
): Promise<ReadLabelResult> {
  const input = {
    image,
    mimeType: 'image/jpeg',
    instructions: INSTRUCTIONS,
    jsonSchema: transcriptionJsonSchema,
  }
  let result = await transcribe(input, config)
  if (!result.ok && result.error === 'UNAVAILABLE') {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    result = await transcribe(input, config)
  }
  if (!result.ok) return { ok: false, code: CODES[result.error] }

  // Never return a partial transcription: it either matches §9.6 or fails.
  const transcription = transcriptionSchema.safeParse(result.json)
  if (!transcription.success) return { ok: false, code: 'VISION_BAD_RESPONSE' }
  return { ok: true, transcription: transcription.data }
}
