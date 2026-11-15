import { z } from 'zod'

// The ONLY file that knows the vision provider is Gemini (docs/spec.md §9.2).
// It does not read secrets nor log anything: the key, the model and fetch come
// as parameters, so it can be tested with Vitest and a fake fetch.

export type ProviderError =
  | 'QUOTA_EXCEEDED' // free tier limit (429 / RESOURCE_EXHAUSTED)
  | 'UNAVAILABLE' // 5xx or network error: can be retried (§9.3)
  | 'TIMEOUT' // no answer in time: not retried (§9.3)
  | 'BLOCKED' // the provider refused or filtered the answer
  | 'BAD_RESPONSE' // the answer is not JSON

export type ProviderResult =
  { ok: true; json: unknown } | { ok: false; error: ProviderError }

export interface ProviderInput {
  image: Uint8Array
  mimeType: string
  instructions: string
  jsonSchema: object
}

export interface ProviderConfig {
  apiKey: string
  model: string
  fetch: typeof fetch
  timeoutMs: number
}

const USER_TEXT = 'Transcribe this nutrition facts table.'

/** The few fields of a generateContent answer that this file reads. */
const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  thought: z.boolean().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
})

/** Base64 without Buffer, in 32 KB chunks so the argument list stays small. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK))
  }
  return btoa(binary)
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

export async function transcribe(
  input: ProviderInput,
  config: ProviderConfig,
): Promise<ProviderResult> {
  const signal = AbortSignal.timeout(config.timeoutMs)
  let status: number
  let bodyText: string
  try {
    const response = await config.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': config.apiKey,
          'content-type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.instructions }] },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: input.mimeType,
                    data: toBase64(input.image),
                  },
                },
                { text: USER_TEXT },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseJsonSchema: input.jsonSchema,
          },
        }),
      },
    )
    status = response.status
    if (status === 429) return { ok: false, error: 'QUOTA_EXCEEDED' }
    if (status >= 500) return { ok: false, error: 'UNAVAILABLE' }
    // Other 4xx (bad key, unknown model, invalid request): retrying would not help.
    if (!response.ok) return { ok: false, error: 'BAD_RESPONSE' }
    bodyText = await response.text()
  } catch {
    return { ok: false, error: signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE' }
  }

  const body = parseJson(bodyText)
  if (!body.ok) return { ok: false, error: 'BAD_RESPONSE' }
  const envelope = geminiResponseSchema.safeParse(body.value)
  if (!envelope.success) return { ok: false, error: 'BAD_RESPONSE' }

  const candidate = envelope.data.candidates?.[0]
  if (
    envelope.data.promptFeedback?.blockReason !== undefined ||
    candidate === undefined ||
    candidate.finishReason !== 'STOP'
  ) {
    return { ok: false, error: 'BLOCKED' }
  }

  const text = (candidate.content?.parts ?? [])
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? '')
    .join('')
  const json = parseJson(text)
  if (!json.ok) return { ok: false, error: 'BAD_RESPONSE' }
  return { ok: true, json: json.value }
}
