import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readLabel, RETRY_DELAY_MS } from './readLabel.ts'
import type { ProviderConfig } from './provider.ts'

// Invented data only. The fake fetch stands in for the Gemini API.

const IMAGE = new Uint8Array([0xff, 0xd8, 1, 2, 3])

const NOT_PRESENT = { status: 'not_present', text: null }

const TRANSCRIPTION = {
  is_nutrition_label: true,
  product_name: { status: 'legible', text: 'Galletitas de prueba' },
  brand: { status: 'illegible', text: null },
  carbohydrate_row_label: { status: 'legible', text: 'Carbohidratos' },
  columns: [
    {
      basis: 'per_portion',
      header_text: 'Porción 30 g',
      state: 'as_sold',
      state_text: null,
      portion_size_g: { status: 'legible', text: '30 g' },
      portion_description: { status: 'legible', text: '3 unidades' },
      carbohydrates_g: { status: 'legible', text: '21,4' },
      energy: { status: 'legible', text: '130 kcal = 546 kJ' },
    },
  ],
  observations: null,
}

function answer(json: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: JSON.stringify(json) }] },
          finishReason: 'STOP',
        },
      ],
    }),
  )
}

function status(code: number): Response {
  return new Response('{}', { status: code })
}

function config(fetchMock: typeof fetch, timeoutMs = 5000): ProviderConfig {
  return {
    apiKey: 'test-key',
    model: 'test-model',
    fetch: fetchMock,
    timeoutMs,
  }
}

describe('readLabel', () => {
  beforeEach(() => {
    // Only setTimeout: the retry wait. AbortSignal.timeout keeps real time.
    vi.useFakeTimers({ toFake: ['setTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ante UNAVAILABLE espera 1 s, reintenta una vez y devuelve la lectura', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(answer(TRANSCRIPTION))
    const pending = readLabel(IMAGE, config(fetchMock))

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await pending).toEqual({ ok: true, transcription: TRANSCRIPTION })
  })

  it('si el reintento también falla con UNAVAILABLE da VISION_UNAVAILABLE', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(status(503))
    const pending = readLabel(IMAGE, config(fetchMock))
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

    expect(await pending).toEqual({ ok: false, code: 'VISION_UNAVAILABLE' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('un error de red también se reintenta', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(answer(TRANSCRIPTION))
    const pending = readLabel(IMAGE, config(fetchMock))
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

    expect(await pending).toEqual({ ok: true, transcription: TRANSCRIPTION })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('el límite gratuito (429) no se reintenta', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(status(429))
    expect(await readLabel(IMAGE, config(fetchMock))).toEqual({
      ok: false,
      code: 'VISION_QUOTA_EXCEEDED',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('el timeout no se reintenta y da VISION_UNAVAILABLE (con setTimeout simulado)', async () => {
    const hangingFetch = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    // Resolves in real time: AbortSignal.timeout is not affected by the fake setTimeout.
    expect(await readLabel(IMAGE, config(hangingFetch, 20))).toEqual({
      ok: false,
      code: 'VISION_UNAVAILABLE',
    })
    expect(hangingFetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'bloqueada',
      new Response(
        JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
      ),
    ],
    [
      'con JSON roto',
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: '{"is_' }] }, finishReason: 'STOP' },
          ],
        }),
      ),
    ],
  ])(
    'una respuesta %s da VISION_BAD_RESPONSE sin reintento',
    async (_, response) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
      expect(await readLabel(IMAGE, config(fetchMock))).toEqual({
        ok: false,
        code: 'VISION_BAD_RESPONSE',
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('un JSON que no cumple el esquema da VISION_BAD_RESPONSE (nunca datos a medias)', async () => {
    const legibleWithoutText = {
      ...TRANSCRIPTION,
      brand: { status: 'legible', text: null },
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(answer(legibleWithoutText))
    expect(await readLabel(IMAGE, config(fetchMock))).toEqual({
      ok: false,
      code: 'VISION_BAD_RESPONSE',
    })
  })

  it('una columna sin energy da VISION_BAD_RESPONSE', async () => {
    const [column] = TRANSCRIPTION.columns
    if (column === undefined) throw new Error('missing column')
    const { energy: _energy, ...withoutEnergy } = column
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(answer({ ...TRANSCRIPTION, columns: [withoutEnergy] }))
    expect(await readLabel(IMAGE, config(fetchMock))).toEqual({
      ok: false,
      code: 'VISION_BAD_RESPONSE',
    })
  })

  it('una foto que no es una tabla nutricional sale bien, con is_nutrition_label false', async () => {
    const notALabel = {
      is_nutrition_label: false,
      product_name: NOT_PRESENT,
      brand: NOT_PRESENT,
      carbohydrate_row_label: NOT_PRESENT,
      columns: [],
      observations: null,
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(answer(notALabel))
    expect(await readLabel(IMAGE, config(fetchMock))).toEqual({
      ok: true,
      transcription: notALabel,
    })
  })
})
