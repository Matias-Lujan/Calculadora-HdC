import { describe, expect, it } from 'vitest'
import {
  CHART_GAP_MS,
  CHART_HOUR_CLEARANCE,
  CHART_WINDOW_MS,
  HOUR_MS,
  chartBridges,
  chartDescription,
  chartExtremes,
  chartGuides,
  chartHours,
  chartPoints,
  chartSegments,
  chartTime,
  chartTop,
  chartX,
  chartY,
  mealMarkTimes,
  mealNear,
  monotonePath,
  nearestIndex,
  pickAt,
  sparklineScale,
  spreadMarks,
  withLatest,
  type ChartPoint,
  type ChartXY,
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
    expect(chartPoints(readings, NOW, CHART_WINDOW_MS)).toEqual([
      { time: start, mgdl: 100 },
      { time: NOW - 60 * MINUTE, mgdl: 110 },
      { time: NOW, mgdl: 120 },
    ])
  })

  it('accepts the offset of PostgREST', () => {
    const readings = [{ measured_at: '2026-11-27T15:00:00+00:00', mgdl: 99 }]
    expect(chartPoints(readings, NOW, CHART_WINDOW_MS)).toEqual([
      { time: Date.parse('2026-11-27T15:00:00Z'), mgdl: 99 },
    ])
  })
})

describe('chartX', () => {
  it('goes from 0 at the start of the window to the width at now', () => {
    expect(chartX(NOW - CHART_WINDOW_MS, NOW, 300, CHART_WINDOW_MS)).toBe(0)
    expect(chartX(NOW, NOW, 300, CHART_WINDOW_MS)).toBe(300)
    expect(chartX(NOW - CHART_WINDOW_MS / 2, NOW, 300, CHART_WINDOW_MS)).toBe(
      150,
    )
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
        CHART_WINDOW_MS,
      ),
    ).toEqual([start, NOW - 60 * MINUTE, NOW])
  })
})

describe('chartHours', () => {
  // A narrow plot, in px (a screen of about 334 px; the chart draws in real
  // px, so any width works).
  const WIDTH = 274
  const AT = (iso: string) => Date.parse(iso)
  const labels = (now: number, windowMs: number) =>
    chartHours(now, windowMs, WIDTH).map((hour) => hour.label)

  it('24 h at 12:20: 18, 00 and 06 in Argentina time; 12 h keeps only its line', () => {
    // 12 h is 20 minutes before now, under 4 units from "ahora".
    expect(chartHours(NOW, CHART_WINDOW_MS, WIDTH)).toEqual([
      { time: AT('2026-11-26T21:00:00Z'), label: '18 h' },
      { time: AT('2026-11-27T03:00:00Z'), label: '00 h' },
      { time: AT('2026-11-27T09:00:00Z'), label: '06 h' },
      { time: AT('2026-11-27T15:00:00Z'), label: null },
    ])
  })

  it('24 h at 22:40: 18 h is written (a fifth of the period cut it before)', () => {
    // 4 h 40 min before now: 274 × 4.67 / 24 ≈ 53 units from the edge.
    expect(labels(AT('2026-11-28T01:40:00Z'), CHART_WINDOW_MS)).toEqual([
      '00 h',
      '06 h',
      '12 h',
      '18 h',
    ])
  })

  it('an hour closer than CHART_HOUR_CLEARANCE to the edge keeps only its line', () => {
    // At 21:56, 18 h is 3 h 56 min before now: about 45 units, where its
    // text would touch "ahora".
    const late = AT('2026-11-28T00:56:00Z')
    expect(labels(late, CHART_WINDOW_MS)).toEqual([
      '00 h',
      '06 h',
      '12 h',
      null,
    ])
    const eighteen = chartHours(late, CHART_WINDOW_MS, WIDTH).at(-1)
    expect(eighteen?.time).toBe(AT('2026-11-27T21:00:00Z'))
    expect(
      WIDTH - chartX(AT('2026-11-27T21:00:00Z'), late, WIDTH, CHART_WINDOW_MS),
    ).toBeLessThan(CHART_HOUR_CLEARANCE)
  })

  it('an hour right at the start is inside; one at now is left for "ahora"', () => {
    const atSix = AT('2026-11-27T09:00:00Z')
    const hours = chartHours(atSix, CHART_WINDOW_MS, WIDTH)
    expect(hours.at(0)).toEqual({
      time: atSix - CHART_WINDOW_MS,
      label: '06 h',
    })
    expect(hours.map((hour) => hour.label)).toEqual([
      '06 h',
      '12 h',
      '18 h',
      '00 h',
    ])
  })

  it('3 and 6 h: every hour; 12 h: every 3', () => {
    // 12 h, 20 minutes before now, is about 30 units from the edge in 3 h.
    expect(labels(NOW, 3 * HOUR_MS)).toEqual(['10 h', '11 h', null])
    expect(labels(NOW, 6 * HOUR_MS)).toEqual([
      '07 h',
      '08 h',
      '09 h',
      '10 h',
      '11 h',
      null,
    ])
    expect(labels(NOW, 12 * HOUR_MS)).toEqual(['03 h', '06 h', '09 h', null])
  })
})

describe('chartPoints with a shorter period', () => {
  it('keeps only the readings of the period', () => {
    const readings = [
      { measured_at: iso(NOW - 4 * HOUR_MS), mgdl: 90 },
      { measured_at: iso(NOW - 3 * HOUR_MS), mgdl: 100 },
      { measured_at: iso(NOW - HOUR_MS), mgdl: 110 },
    ]
    expect(chartPoints(readings, NOW, 3 * HOUR_MS)).toEqual([
      { time: NOW - 3 * HOUR_MS, mgdl: 100 },
      { time: NOW - HOUR_MS, mgdl: 110 },
    ])
  })
})

describe('chartX and chartTime with a shorter period', () => {
  it('the start of 3 h is at 0', () => {
    expect(chartX(NOW - 3 * HOUR_MS, NOW, 300, 3 * HOUR_MS)).toBe(0)
    expect(chartX(NOW - 90 * MINUTE, NOW, 300, 3 * HOUR_MS)).toBe(150)
  })

  it('chartTime goes back from a place to its time', () => {
    expect(chartTime(150, NOW, 300, 3 * HOUR_MS)).toBe(NOW - 90 * MINUTE)
    expect(chartTime(0, NOW, 300, CHART_WINDOW_MS)).toBe(NOW - CHART_WINDOW_MS)
    expect(chartTime(300, NOW, 300, CHART_WINDOW_MS)).toBe(NOW)
  })

  it('a tap out of the drawing stays inside the window', () => {
    expect(chartTime(-20, NOW, 300, 6 * HOUR_MS)).toBe(NOW - 6 * HOUR_MS)
    expect(chartTime(340, NOW, 300, 6 * HOUR_MS)).toBe(NOW)
  })
})

describe('sparklineScale', () => {
  it('always the whole band, with 10 mg/dL of air', () => {
    expect(sparklineScale([point(0, 120)])).toEqual({ bottom: 60, top: 190 })
    expect(sparklineScale([])).toEqual({ bottom: 60, top: 190 })
  })

  it('goes beyond the band when a reading does', () => {
    expect(sparklineScale([point(30, 55), point(0, 250)])).toEqual({
      bottom: 45,
      top: 260,
    })
  })

  it('chartY with its bottom', () => {
    expect(chartY(60, 190, 40, 60)).toBe(40)
    expect(chartY(190, 190, 40, 60)).toBe(0)
    expect(chartY(50, 190, 40, 60)).toBe(40)
  })
})

describe('chartGuides', () => {
  it('from 100 to the top, every 50, without 50', () => {
    expect(chartGuides(300)).toEqual([100, 150, 200, 250, 300])
    expect(chartGuides(350)).toEqual([100, 150, 200, 250, 300, 350])
    expect(chartGuides(400)).toEqual([100, 150, 200, 250, 300, 350, 400])
  })
})

describe('chartBridges', () => {
  it('only the gaps of more than one hour', () => {
    const a = point(200, 100)
    const b = { time: a.time + HOUR_MS + 1, mgdl: 110 }
    const c = { time: b.time + HOUR_MS, mgdl: 120 }
    const d = { time: c.time + 45 * MINUTE, mgdl: 130 }
    expect(chartBridges([a, b, c, d])).toEqual([{ from: a, to: b }])
  })

  it('without readings or with one, none', () => {
    expect(chartBridges([])).toEqual([])
    expect(chartBridges([point(0, 100)])).toEqual([])
  })
})

describe('nearestIndex and pickAt', () => {
  const points = [point(60, 100), point(45, 110), point(0, 150)]

  it('without readings, nothing', () => {
    expect(nearestIndex([], NOW)).toBeNull()
    expect(pickAt([], NOW)).toBeNull()
  })

  it('a tap right on a reading picks it', () => {
    expect(pickAt(points, NOW - 45 * MINUTE)).toEqual({
      kind: 'reading',
      index: 1,
      point: points[1],
    })
  })

  it('between two readings, the closest; on a tie, the newer', () => {
    expect(nearestIndex(points, NOW - 50 * MINUTE)).toBe(1)
    expect(nearestIndex(points, NOW - 56 * MINUTE)).toBe(0)
    // 22.5 minutes from both.
    expect(nearestIndex(points, NOW - 22.5 * MINUTE)).toBe(2)
  })

  it('exactly 30 minutes from the closest still picks it', () => {
    const apart = [point(120, 100), point(0, 150)]
    expect(pickAt(apart, NOW - 90 * MINUTE)).toMatchObject({
      kind: 'reading',
      index: 0,
    })
  })

  it('in a gap, the two readings at its ends', () => {
    const apart = [point(120, 100), point(0, 150)]
    expect(pickAt(apart, NOW - 60 * MINUTE)).toEqual({
      kind: 'gap',
      before: apart[0],
      after: apart[1],
    })
  })

  it('before the first or after the last reading, one end is missing', () => {
    const one = [point(120, 100)]
    expect(pickAt(one, NOW - 200 * MINUTE)).toEqual({
      kind: 'gap',
      before: null,
      after: one[0],
    })
    expect(pickAt(one, NOW)).toEqual({
      kind: 'gap',
      before: one[0],
      after: null,
    })
  })
})

describe('mealNear', () => {
  const marks = [NOW - 120 * MINUTE, NOW - 100 * MINUTE]

  it('a meal up to 15 minutes before or after', () => {
    expect(mealNear(marks, NOW - 135 * MINUTE)).toBe(marks[0])
    expect(mealNear(marks, NOW - 85 * MINUTE)).toBe(marks[1])
  })

  it('the closest of two', () => {
    expect(mealNear(marks, NOW - 108 * MINUTE)).toBe(marks[1])
    expect(mealNear(marks, NOW - 112 * MINUTE)).toBe(marks[0])
  })

  it('farther than 15 minutes, or without meals, none', () => {
    expect(mealNear(marks, NOW - 136 * MINUTE)).toBeNull()
    expect(mealNear([], NOW)).toBeNull()
  })
})

describe('chartExtremes', () => {
  it('the lowest and the highest', () => {
    const points = [
      point(60, 140),
      point(45, 65),
      point(30, 210),
      point(0, 120),
    ]
    expect(chartExtremes(points)).toEqual({
      lowest: points[1],
      highest: points[2],
    })
  })

  it('on a tie, the newer one', () => {
    const points = [point(60, 80), point(45, 200), point(30, 80), point(0, 200)]
    expect(chartExtremes(points)).toEqual({
      lowest: points[2],
      highest: points[3],
    })
  })

  it('with one reading, all of them equal or none, nothing', () => {
    expect(chartExtremes([])).toBeNull()
    expect(chartExtremes([point(0, 100)])).toBeNull()
    expect(chartExtremes([point(15, 100), point(0, 100)])).toBeNull()
  })
})

describe('spreadMarks', () => {
  it('icons far apart stay at their marks', () => {
    expect(spreadMarks([50, 100, 200], 12, 40, 300)).toEqual([50, 100, 200])
  })

  it('two close together are moved apart, one a bit over the other', () => {
    expect(spreadMarks([100, 104, 106], 12, 40, 300)).toEqual([100, 112, 124])
  })

  it('they stay between the edges, pushed back from the end', () => {
    expect(spreadMarks([20], 12, 40, 300)).toEqual([40])
    expect(spreadMarks([295, 298], 12, 40, 300)).toEqual([288, 300])
    expect(spreadMarks([310], 12, 40, 300)).toEqual([300])
  })

  it('without meals, nothing', () => {
    expect(spreadMarks([], 12, 40, 300)).toEqual([])
  })
})

describe('chartDescription', () => {
  it('says the period, how many readings, the lowest and the highest, and the meals', () => {
    expect(
      chartDescription(
        [point(30, 140), point(15, 95), point(0, 210)],
        2,
        CHART_WINDOW_MS,
      ),
    ).toBe(
      'Glucosa de las últimas 24 horas: 3 lecturas, entre 95 y 210 mg/dL, 2 comidas guardadas.',
    )
    expect(chartDescription([point(0, 100)], 1, 6 * HOUR_MS)).toBe(
      'Glucosa de las últimas 6 horas: 1 lectura, de 100 mg/dL, 1 comida guardada.',
    )
  })

  it('without readings nor meals', () => {
    expect(chartDescription([], 0, 3 * HOUR_MS)).toBe(
      'Glucosa de las últimas 3 horas: sin lecturas, sin comidas guardadas.',
    )
  })
})

/** The cubic pieces of a path: start, two controls and end of each one. */
function cubics(d: string): ChartXY[][] {
  const numbers = (text: string) => text.split(',').map(Number)
  const [move, ...rest] = d.split('C')
  const [sx = NaN, sy = NaN] = numbers((move ?? '').slice(1))
  let start: ChartXY = { x: sx, y: sy }
  return rest.map((piece) => {
    const [ax, ay, bx, by, ex, ey] = numbers(piece)
    const curve = [
      start,
      { x: ax ?? NaN, y: ay ?? NaN },
      { x: bx ?? NaN, y: by ?? NaN },
      { x: ex ?? NaN, y: ey ?? NaN },
    ]
    start = curve[3] ?? start
    return curve
  })
}

/** Where a cubic piece is at t, from 0 to 1. */
function at(curve: ChartXY[], t: number): ChartXY {
  const [p0, p1, p2, p3] = curve as [ChartXY, ChartXY, ChartXY, ChartXY]
  const u = 1 - t
  const mix = (a: number, b: number, c: number, e: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * e
  return { x: mix(p0.x, p1.x, p2.x, p3.x), y: mix(p0.y, p1.y, p2.y, p3.y) }
}

describe('monotonePath', () => {
  it('is empty without points and only a move with one', () => {
    expect(monotonePath([])).toBe('')
    expect(monotonePath([{ x: 10, y: 20 }])).toBe('M10,20')
  })

  it('is a straight line with two points', () => {
    expect(
      monotonePath([
        { x: 0, y: 100 },
        { x: 30, y: 40 },
      ]),
    ).toBe('M0,100L30,40')
  })

  it('goes through every point, left to right', () => {
    const points = [
      { x: 0, y: 200 },
      { x: 10, y: 150 },
      { x: 20, y: 160 },
      { x: 30, y: 90 },
    ]
    const curves = cubics(monotonePath(points))
    expect(curves).toHaveLength(3)
    curves.forEach((curve, i) => {
      expect(curve[0]).toEqual(points[i])
      expect(curve[3]).toEqual(points[i + 1])
    })
  })

  it('never goes over nor under the readings in a rise, a plateau and a fall', () => {
    // In px: a smaller y is higher. Uneven steps, as the readings come.
    const points = [
      { x: 0, y: 200 },
      { x: 12, y: 180 },
      { x: 20, y: 60 },
      { x: 35, y: 60 },
      { x: 40, y: 62 },
      { x: 55, y: 60 },
      { x: 60, y: 190 },
      { x: 90, y: 200 },
    ]
    const curves = cubics(monotonePath(points))
    expect(curves).toHaveLength(points.length - 1)
    curves.forEach((curve) => {
      const [from, , , to] = curve as [ChartXY, ChartXY, ChartXY, ChartXY]
      const low = Math.min(from.y, to.y)
      const high = Math.max(from.y, to.y)
      for (let step = 0; step <= 50; step++) {
        const point = at(curve, step / 50)
        expect(point.y).toBeGreaterThanOrEqual(low - 1e-9)
        expect(point.y).toBeLessThanOrEqual(high + 1e-9)
        expect(point.x).toBeGreaterThanOrEqual(from.x - 1e-9)
        expect(point.x).toBeLessThanOrEqual(to.x + 1e-9)
      }
    })
    // Flat between two equal readings.
    const plateau = curves[2] as ChartXY[]
    expect(plateau.every((point) => point.y === 60)).toBe(true)
  })

  it('has no NaN with two readings at the same time', () => {
    const d = monotonePath([
      { x: 0, y: 100 },
      { x: 10, y: 80 },
      { x: 10, y: 80 },
      { x: 20, y: 90 },
    ])
    expect(d).not.toContain('NaN')
    expect(d).not.toContain('Infinity')
  })
})
