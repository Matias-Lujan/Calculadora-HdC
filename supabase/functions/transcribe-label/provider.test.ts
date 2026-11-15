import { describe, expect, it, vi } from 'vitest'
import { transcribe, type ProviderConfig } from './provider.ts'

// Invented data only. The fake fetch stands in for the Gemini API.

const INPUT = {
  image: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  mimeType: 'image/jpeg',
  instructions: 'Instrucciones de prueba',
  jsonSchema: { type: 'object' },
}

function config(fetchMock: typeof fetch, timeoutMs = 5000): ProviderConfig {
  return {
    apiKey: 'test-key',
    model: 'test-model',
    fetch: fetchMock,
    timeoutMs,
  }
}

function geminiAnswer(text: string, extra: object = {}): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text }] }, finishReason: 'STOP', ...extra },
      ],
    }),
    { status: 200 },
  )
}

/** A fetch that never answers and rejects when its signal aborts. */
const hangingFetch: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    )
  })

describe('transcribe', () => {
  it('con una respuesta válida devuelve el JSON y arma bien el pedido', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      geminiAnswer('{"is_nutrition_label":true}'),
    )
    const result = await transcribe(INPUT, config(fetchMock))

    expect(result).toEqual({ ok: true, json: { is_nutrition_label: true } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
    )
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-key')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const body: unknown = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: 'Instrucciones de prueba' }] },
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: btoa(String.fromCharCode(...INPUT.image)),
              },
            },
            { text: 'Transcribe this nutrition facts table.' },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
      },
    })
  })

  it('ignora las partes de razonamiento (thought)', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: 'pensando…', thought: true },
                    { text: '{"a":' },
                    { text: '1}' },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
          }),
        ),
    )
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: true,
      json: { a: 1 },
    })
  })

  it('429 da QUOTA_EXCEEDED', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('{}', { status: 429 }),
    )
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: false,
      error: 'QUOTA_EXCEEDED',
    })
  })

  it.each([500, 503])('%i da UNAVAILABLE', async (status) => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('{}', { status }),
    )
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    })
  })

  it('un error de red da UNAVAILABLE', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    })
  })

  it('si no responde a tiempo da TIMEOUT', async () => {
    expect(await transcribe(INPUT, config(hangingFetch, 20))).toEqual({
      ok: false,
      error: 'TIMEOUT',
    })
  })

  it('400 (pedido inválido o key rota) da BAD_RESPONSE', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('{}', { status: 400 }),
    )
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_RESPONSE',
    })
  })

  it('un cuerpo que no es JSON da BAD_RESPONSE', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('<html>error</html>', { status: 200 }),
    )
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_RESPONSE',
    })
  })

  it('un cuerpo JSON con otra forma da BAD_RESPONSE', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('{"candidates":"no"}', { status: 200 }),
    )
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_RESPONSE',
    })
  })

  it('un texto del modelo que no es JSON da BAD_RESPONSE', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      geminiAnswer('{"is_nutrition_label": tr'),
    )
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: false,
      error: 'BAD_RESPONSE',
    })
  })

  it.each([
    ['blockReason', { promptFeedback: { blockReason: 'SAFETY' } }],
    [
      'finishReason distinto de STOP',
      {
        candidates: [
          { content: { parts: [{ text: '{}' }] }, finishReason: 'SAFETY' },
        ],
      },
    ],
    ['sin candidatos', { candidates: [] }],
  ])('una respuesta bloqueada (%s) da BLOCKED', async (_, answer) => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(answer), { status: 200 }),
    )
    expect(await transcribe(INPUT, config(fetchMock))).toEqual({
      ok: false,
      error: 'BLOCKED',
    })
  })

  it('codifica en base64 una imagen grande sin perder bytes', async () => {
    const image = new Uint8Array(100 * 1024)
    for (let i = 0; i < image.length; i++) image[i] = (i * 31 + 7) % 256
    const fetchMock = vi.fn<typeof fetch>(async () => geminiAnswer('{}'))
    await transcribe({ ...INPUT, image }, config(fetchMock))

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      contents: [{ parts: [{ inlineData: { data: string } }] }]
    }
    const decoded = atob(body.contents[0].parts[0].inlineData.data)
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0))
    expect(bytes).toEqual(image)
  })
})
