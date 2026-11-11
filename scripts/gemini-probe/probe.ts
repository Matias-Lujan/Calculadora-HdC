// Stage 1b probe (docs/plan.md): sends every photo in samples/ to each model,
// at full size and resized like the app will (1600 px long side), and saves
// each answer in output/<run>/. Both folders are git-ignored.
//
// Run: node --env-file=.env.local scripts/gemini-probe/probe.ts <run> [model…]
// SAMPLES=<subfolder> reads photos from samples/<subfolder> instead.
// Answers that already succeeded in that run are skipped, so running it again
// only retries the failed ones.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { INSTRUCTIONS } from './prompt.ts'
import { transcriptionJsonSchema, transcriptionSchema } from './schema.ts'

const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite']
const SIZES = [
  { name: 'full', maxSide: null },
  { name: '1600', maxSide: 1600 },
] as const
const TIMEOUT_MS = 180_000

const [runName = 'v1', ...modelArgs] = process.argv.slice(2)
const models = modelArgs.length > 0 ? modelArgs : DEFAULT_MODELS
const samplesDir = path.join(
  import.meta.dirname,
  'samples',
  process.env.SAMPLES ?? '',
)
const outputDir = path.join(import.meta.dirname, 'output', runName)

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('Falta GEMINI_API_KEY en .env.local')
  process.exit(1)
}

async function prepareImage(
  original: Buffer,
  maxSide: number | null,
): Promise<Buffer> {
  if (maxSide === null) return original
  return sharp(original)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer()
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] }
    finishReason?: string
  }[]
  usageMetadata?: unknown
  error?: { status?: string; message?: string }
}

async function transcribe(model: string, image: Buffer) {
  const started = Date.now()
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey!,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: image.toString('base64'),
                },
              },
              { text: 'Transcribe this nutrition facts table.' },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseJsonSchema: transcriptionJsonSchema,
        },
      }),
    },
  )
  const ms = Date.now() - started
  const body = (await response.json()) as GeminiResponse
  const candidate = body.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('')

  let parsed: unknown = null
  let jsonError: string | null = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch (error) {
    jsonError = String(error)
  }
  const validation = transcriptionSchema.safeParse(parsed)

  return {
    model,
    httpStatus: response.status,
    ms,
    finishReason: candidate?.finishReason ?? null,
    apiError: body.error ?? null,
    usage: body.usageMetadata ?? null,
    jsonError,
    schemaValid: validation.success,
    schemaIssues: validation.success ? null : validation.error.issues,
    transcription: parsed,
  }
}

async function alreadySucceeded(file: string): Promise<boolean> {
  try {
    const previous: unknown = JSON.parse(await readFile(file, 'utf8'))
    return (
      typeof previous === 'object' &&
      previous !== null &&
      'httpStatus' in previous &&
      previous.httpStatus === 200
    )
  } catch {
    return false
  }
}

await mkdir(outputDir, { recursive: true })
await writeFile(path.join(outputDir, 'prompt.txt'), INSTRUCTIONS)
const files = (await readdir(samplesDir)).filter((file) =>
  /\.(jpe?g|png)$/i.test(file),
)

for (const [index, file] of files.entries()) {
  const original = await readFile(path.join(samplesDir, file))
  for (const size of SIZES) {
    const image = await prepareImage(original, size.maxSide)
    for (const model of models) {
      const name = `foto${index + 1}__${size.name}__${model}.json`
      if (await alreadySucceeded(path.join(outputDir, name))) continue
      const result = await transcribe(model, image).catch((error: unknown) => ({
        model,
        failure: String(error),
      }))
      await writeFile(
        path.join(outputDir, name),
        JSON.stringify({ file, size: size.name, ...result }, null, 2),
      )
      const summary =
        'failure' in result
          ? `FALLA ${result.failure}`
          : `HTTP ${result.httpStatus} ${result.ms} ms, esquema ${result.schemaValid ? 'ok' : 'INVÁLIDO'}`
      console.log(
        `foto${index + 1} ${size.name.padEnd(4)} ${model.padEnd(22)} ${summary}`,
      )
    }
  }
}
