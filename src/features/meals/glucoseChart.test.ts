import { describe, expect, it } from 'vitest'
import {
  CHART_GAP_MS,
  CHART_WINDOW_MS,
  chartDescription,
  chartHours,
  chartPoints,
  chartSegments,
  chartTop,
  chartX,
  chartY,
  mealMarkTimes,
  withLatest,
  type ChartPoint,
} from './glucoseChart.ts'

// Invented readings. 15:20 UTC is 12:20 in Argentina.
const NOW = Date.parse('2026-11-27T15:20:00.000Z')
const MINUTE = 60 * 1000
const iso = (time: number) => new Date(time).toISOString()
const point = (minutesAgo: number, mgdl: number): ChartPoint => ({
  time: NOW - minutesAgo * MINUTE,
  mgdl,
})

describe('chartPoints', () => {
  it('keeps only the readings of the window, oldest first', () => {
    const start = NOW - CHART_WINDOW_MS
    const readings = [
      { measured_at: iso(NOW), mgdl: 120 },
      { measured_at: iso(start - 1), mgdl: 90 },
      { measured_at: iso(start), mgdl: 100 },
      { measured_at: iso(NOW + 1), mgdl: 130 },
      { measured_at: iso(NOW - 60 * MINUTE), mgdl: 110 },
    ]
    expect(chartPoints(readings, NOW)).toEqual([
      { time: start, mgdl: 100 },
      { time: NOW - 60 * MINUTE, mgdl: 110 },
      { time: NOW, mgdl: 120 },
    ])
  })

  it('accepts the offset of PostgREST', () => {
    const readings = [{ measured_at: '2026-11-27T15:00:00+00:00', mgdl: 99 }]
    expect(chartPoints(readings, NOW)).toEqual([
      { time: Date.parse('2026-11-27T15:00:00Z'), mgdl: 99 },
    ])
  })
})

describe('chartX', () => {
  it('goes from 0 at the start of the window to the width at now', () => {
    expect(chartX(NOW - CHART_WINDOW_MS, NOW, 300)).toBe(0)
    expect(chartX(NOW, NOW, 300)).toBe(300)
    expect(chartX(NOW - CHART_WINDOW_MS / 2, NOW, 300)).toBe(150)
  })
})

describe('chartY', () => {
  it('is upside down: the bottom of the scale at the height, the top at 0', () => {
    expect(chartY(40, 300, 200)).toBe(200)
    expect(chartY(300, 300, 200)).toBe(0)
    expect(chartY(170, 300, 200)).toBe(100)
    expect(chartY(180, 300, 200)).toBeLessThan(chartY(70, 300, 200))
  })

  it('a value below the bottom stays on it', () => {
    expect(chartY(20, 300, 200)).toBe(200)
  })
})

describe('chartTop', () => {
  it('is 300 without readings or with all of them lower', () => {
    expect(chartTop([])).toBe(300)
    expect(chartTop([point(5, 299)])).toBe(300)
    expect(chartTop([point(5, 300)])).toBe(300)
  })

  it('a higher reading rounds up to a multiple of 50', () => {
    expect(chartTop([point(5, 310)])).toBe(350)
    expect(chartTop([point(5, 350)])).toBe(350)
    expect(chartTop([point(5, 351), point(10, 100)])).toBe(400)
    expect(chartTop([point(5, 500)])).toBe(500)
  })
})

describe('chartSegments', () => {
  it('without readings, no pieces', () => {
    expect(chartSegments([])).toEqual([])
  })

  it('exactly 30 minutes between readings does not cut the line', () => {
    const points = [point(60, 100), point(30, 110), point(0, 120)]
    expect(chartSegments(points)).toEqual([points])
  })

  it('more than 30 minutes cuts it', () => {
    const a = point(61, 100)
    const b = { time: a.time + CHART_GAP_MS + MINUTE, mgdl: 110 }
    const c = { time: b.time + 15 * MINUTE, mgdl: 120 }
    expect(chartSegments([a, b, c])).toEqual([[a], [b, c]])
  })

  it('one more millisecond than 30 minutes cuts it too', () => {
    const a = point(60, 100)
    const b = { time: a.time + CHART_GAP_MS + 1, mgdl: 110 }
    expect(chartSegments([a, b])).toEqual([[a], [b]])
  })
})

describe('withLatest', () => {
  const saved = [
    { measured_at: iso(NOW - 30 * MINUTE), mgdl: 100 },
    { measured_at: iso(NOW - 15 * MINUTE), mgdl: 110 },
  ]

  it('adds the live reading when it is newer than the last saved one', () => {
    const latest = { measured_at: iso(NOW - 2 * MINUTE), mgdl: 115 }
    expect(withLatest(saved, latest, NOW)).toEqual([...saved, latest])
  })

  it('does not add it when it is the same time or older', () => {
    expect(
      withLatest(
        saved,
        { measured_at: iso(NOW - 15 * MINUTE), mgdl: 111 },
        NOW,
      ),
    ).toEqual(saved)
    expect(
      withLatest(
        saved,
        { measured_at: iso(NOW - 20 * MINUTE), mgdl: 105 },
        NOW,
      ),
    ).toEqual(saved)
  })

  it('adds it without saved readings', () => {
    const latest = { measured_at: iso(NOW - MINUTE), mgdl: 98 }
    expect(withLatest([], latest, NOW)).toEqual([latest])
  })

  it('does not add one outside the window', () => {
    const ahead = { measured_at: iso(NOW + MINUTE), mgdl: 98 }
    expect(withLatest([], ahead, NOW)).toEqual([])
    const old = { measured_at: iso(NOW - CHART_WINDOW_MS - 1), mgdl: 98 }
    expect(withLatest([], old, NOW)).toEqual([])
  })

  it('without a live reading (none, or not loaded), only the saved ones', () => {
    expect(withLatest(saved, null, NOW)).toEqual(saved)
    expect(withLatest(saved, undefined, NOW)).toEqual(saved)
  })
})

describe('mealMarkTimes', () => {
  it('keeps the meals inside the window, oldest first', () => {
    const start = NOW - CHART_WINDOW_MS
    expect(
      mealMarkTimes(
        [
          iso(NOW - 60 * MINUTE),
          iso(start - 1),
          iso(start),
          iso(NOW + MINUTE),
          '2026-11-27T15:20:00+00:00',
        ],
        NOW,
      ),
    ).toEqual([start, NOW - 60 * MINUTE, NOW])
  })
})

describe('chartHours', () => {
  it('00, 06, 12 and 18 in Argentina time, inside the window', () => {
    expect(chartHours(NOW)).toEqual([
      { time: Date.parse('2026-11-26T21:00:00Z'), label: '18 h' },
      { time: Date.parse('2026-11-27T03:00:00Z'), label: '00 h' },
      { time: Date.parse('2026-11-27T09:00:00Z'), label: '06 h' },
      { time: Date.parse('2026-11-27T15:00:00Z'), label: '12 h' },
    ])
  })

  it('an hour right at the start or at now is inside', () => {
    const atSix = Date.parse('2026-11-27T09:00:00Z')
    const hours = chartHours(atSix)
    expect(hours.at(0)).toEqual({
      time: atSix - CHART_WINDOW_MS,
      label: '06 h',
    })
    expect(hours.at(-1)).toEqual({ time: atSix, label: '06 h' })
    expect(hours).toHaveLength(5)
  })
})

describe('chartDescription', () => {
  it('says how many readings, the lowest and the highest, and the meals', () => {
    expect(
      chartDescription([point(30, 140), point(15, 95), point(0, 210)], 2),
    ).toBe(
      'Glucosa de las últimas 24 horas: 3 lecturas, entre 95 y 210 mg/dL, 2 comidas guardadas.',
    )
    expect(chartDescription([point(0, 100)], 1)).toBe(
      'Glucosa de las últimas 24 horas: 1 lectura, de 100 mg/dL, 1 comida guardada.',
    )
  })

  it('without readings nor meals', () => {
    expect(chartDescription([], 0)).toBe(
      'Glucosa de las últimas 24 horas: sin lecturas, sin comidas guardadas.',
    )
  })
})
