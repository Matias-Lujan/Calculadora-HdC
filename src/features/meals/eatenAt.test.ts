import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateTimeInputValue, eatenAtFromInput } from './eatenAt.ts'

describe('dateTimeInputValue', () => {
  it.each([
    ['2026-11-14T16:05:00.000Z', '2026-11-14T13:05'],
    // Another day in Buenos Aires.
    ['2026-11-15T01:30:00.000Z', '2026-11-14T22:30'],
    // Another year.
    ['2027-01-01T02:59:00.000Z', '2026-12-31T23:59'],
    // Midnight is "00", not "24".
    ['2026-11-14T03:00:00.000Z', '2026-11-14T00:00'],
    // The seconds are dropped, not rounded.
    ['2026-11-14T16:05:59.999Z', '2026-11-14T13:05'],
    ['2028-02-29T12:00:00.000Z', '2028-02-29T09:00'],
    ['2026-03-01T02:00:00.000Z', '2026-02-28T23:00'],
  ])('%s → %s', (iso, value) => {
    expect(dateTimeInputValue(new Date(iso))).toBe(value)
  })

  it('pads every part to two digits (four for the year)', () => {
    expect(dateTimeInputValue(new Date('2026-01-02T06:04:00.000Z'))).toBe(
      '2026-01-02T03:04',
    )
  })
})

describe('eatenAtFromInput', () => {
  it.each([
    ['2026-11-14T13:05', '2026-11-14T16:05:00.000Z'],
    ['2026-12-31T22:30', '2027-01-01T01:30:00.000Z'],
    ['2026-11-14T00:00', '2026-11-14T03:00:00.000Z'],
    ['2026-11-14T13:05:30', '2026-11-14T16:05:30.000Z'],
    ['2026-11-14T23:59', '2026-11-15T02:59:00.000Z'],
    ['2028-02-29T21:00', '2028-03-01T00:00:00.000Z'],
    // A future date is accepted.
    ['2030-06-15T12:00', '2030-06-15T15:00:00.000Z'],
  ])('%s → %s', (text, iso) => {
    expect(eatenAtFromInput(text)).toBe(iso)
  })

  it.each([
    '',
    '   ',
    '2026-02-30T10:00',
    '2027-02-29T10:00',
    '2026-13-01T10:00',
    '2026-00-10T10:00',
    '2026-11-00T10:00',
    '2026-11-31T10:00',
    '2026-11-14T24:00',
    '2026-11-14T13:60',
    '2026-11-14T13:05:60',
    '2026-11-14 13:05',
    '2026-11-14',
    '13:05',
    'abc',
    '0099-01-01T10:00',
    '0000-01-01T10:00',
    '2026-11-14T13:05Z',
    '2026-11-14T13:05:00.000',
    ' 2026-11-14T13:05',
    '2026-11-14T13:05 ',
    '2026-1-14T13:05',
    '+02026-11-14T13:05',
  ])('%j → null', (text) => {
    expect(eatenAtFromInput(text)).toBeNull()
  })

  it('round-trips instants with exact minutes', () => {
    const instants = [
      '2026-11-14T16:05:00.000Z',
      '2026-11-14T03:00:00.000Z',
      '2026-11-15T02:59:00.000Z',
      '2026-12-01T02:30:00.000Z',
      '2027-01-01T00:00:00.000Z',
      '2027-01-01T03:00:00.000Z',
      '2028-02-29T03:00:00.000Z',
      '2028-03-01T02:59:00.000Z',
      '2026-06-30T23:59:00.000Z',
    ]
    for (const iso of instants) {
      expect(eatenAtFromInput(dateTimeInputValue(new Date(iso)))).toBe(iso)
    }
  })

  it('every minute of a day, read back, gives the same field value', () => {
    const start = Date.UTC(2026, 10, 14, 3, 0)
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      const date = new Date(start + minute * 60_000)
      const value = dateTimeInputValue(date)
      const iso = eatenAtFromInput(value)
      expect(iso).toBe(date.toISOString())
    }
  })
})

// --- Edge cases added by the tester ---

describe('dateTimeInputValue, edge cases', () => {
  it.each([
    // Minute 59, at every kind of boundary.
    ['2026-11-14T16:59:00.000Z', '2026-11-14T13:59'],
    ['2026-11-14T02:59:59.999Z', '2026-11-13T23:59'],
    ['2026-12-01T02:59:00.000Z', '2026-11-30T23:59'],
    // January 1.
    ['2027-01-01T03:00:00.000Z', '2027-01-01T00:00'],
    ['2027-01-01T02:59:59.999Z', '2026-12-31T23:59'],
    ['2027-01-01T15:01:00.000Z', '2027-01-01T12:01'],
    // Hours of a single digit are padded.
    ['2026-11-14T03:01:00.000Z', '2026-11-14T00:01'],
    ['2026-11-14T12:09:00.000Z', '2026-11-14T09:09'],
    // 28/2 of a year that is not a leap year is followed by 1/3.
    ['2027-03-01T02:59:00.000Z', '2027-02-28T23:59'],
    ['2027-03-01T03:00:00.000Z', '2027-03-01T00:00'],
    // 2000 is a leap year; 2100 is not.
    ['2000-02-29T15:00:00.000Z', '2000-02-29T12:00'],
    ['2100-03-01T02:00:00.000Z', '2100-02-28T23:00'],
    // A year with four digits up to 9999.
    ['9999-12-31T23:59:00.000Z', '9999-12-31T20:59'],
  ])('%s → %s', (iso, value) => {
    expect(dateTimeInputValue(new Date(iso))).toBe(value)
  })

  it('always has the shape of a datetime-local value', () => {
    const start = Date.UTC(2026, 0, 1, 0, 0)
    for (let hour = 0; hour < 24 * 400; hour += 13) {
      const value = dateTimeInputValue(new Date(start + hour * 3_600_000))
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    }
  })
})

describe('eatenAtFromInput, edge cases', () => {
  it.each([
    // Minute 59.
    ['2026-11-14T13:59', '2026-11-14T16:59:00.000Z'],
    ['2026-11-30T21:59', '2026-12-01T00:59:00.000Z'],
    ['2026-12-31T23:59', '2027-01-01T02:59:00.000Z'],
    // January 1.
    ['2027-01-01T00:00', '2027-01-01T03:00:00.000Z'],
    ['2027-01-01T00:59', '2027-01-01T03:59:00.000Z'],
    // Hours of a single digit (padded by the field).
    ['2026-11-14T00:01', '2026-11-14T03:01:00.000Z'],
    ['2026-11-14T09:05', '2026-11-14T12:05:00.000Z'],
    // The last day of each kind of month.
    ['2027-02-28T10:00', '2027-02-28T13:00:00.000Z'],
    ['2026-04-30T10:00', '2026-04-30T13:00:00.000Z'],
    ['2026-01-31T10:00', '2026-01-31T13:00:00.000Z'],
    // 2000 is a leap year.
    ['2000-02-29T10:00', '2000-02-29T13:00:00.000Z'],
    // Year 9999, while the instant still has four digits.
    ['9999-12-31T20:59', '9999-12-31T23:59:00.000Z'],
    ['9999-01-01T00:00', '9999-01-01T03:00:00.000Z'],
    // Seconds 59 are kept.
    ['2026-11-14T13:05:59', '2026-11-14T16:05:59.000Z'],
  ])('%s → %s', (text, iso) => {
    expect(eatenAtFromInput(text)).toBe(iso)
  })

  it.each([
    // 29/2 of years that are not leap years (2100 and 1900 included).
    '2026-02-29T10:00',
    '2100-02-29T10:00',
    '1900-02-29T10:00',
    // 31 of a month with 30 days.
    '2026-04-31T10:00',
    '2026-06-31T10:00',
    '2026-09-31T10:00',
    // Hours and minutes not padded, or out of range.
    '2026-11-14T9:05',
    '2026-11-14T09:5',
    '2026-11-14T25:00',
    '2026-11-14T99:99',
    '2026-11-14T13:05:5',
    // A year with five digits.
    '10000-01-01T10:00',
    // Other separators or characters.
    '2026/11/14T13:05',
    '2026-11-14t13:05',
    '２０２６-11-14T13:05',
    '2026-11-14T13:05\n',
  ])('%j → null', (text) => {
    expect(eatenAtFromInput(text)).toBeNull()
  })

  it('a value with seconds keeps them; without, they are 0', () => {
    expect(eatenAtFromInput('2026-11-14T13:05:00')).toBe(
      eatenAtFromInput('2026-11-14T13:05'),
    )
  })

  it('every hour of a non-leap February round-trips', () => {
    const start = Date.UTC(2027, 1, 1, 3, 0)
    for (let hour = 0; hour < 28 * 24; hour += 1) {
      const date = new Date(start + hour * 3_600_000 + 59 * 60_000)
      expect(eatenAtFromInput(dateTimeInputValue(date))).toBe(
        date.toISOString(),
      )
    }
  })

  // Argentina had daylight saving time in 2007–2009. Clocks went from 00:00
  // to 01:00 on 2007-12-30: 00:30 never existed there.
  it('a wall-clock time that never existed in Buenos Aires is null', () => {
    expect(eatenAtFromInput('2007-12-30T00:30')).toBeNull()
  })

  // Clocks went back from 00:00 to 23:00 on 2008-03-16: 23:30 of the 15th
  // happened twice. Either instant is accepted, as long as it reads back.
  it('a wall-clock time that happened twice gives one of its instants', () => {
    const iso = eatenAtFromInput('2008-03-15T23:30')
    expect(['2008-03-16T01:30:00.000Z', '2008-03-16T02:30:00.000Z']).toContain(
      iso,
    )
    expect(dateTimeInputValue(new Date(iso ?? ''))).toBe('2008-03-15T23:30')
  })

  // In January 2008 Buenos Aires was at UTC−2: the offset comes from the
  // time zone database at that date, not from a fixed −3.
  it('uses the offset Buenos Aires had at that date', () => {
    expect(eatenAtFromInput('2008-01-15T12:00')).toBe(
      '2008-01-15T14:00:00.000Z',
    )
    expect(dateTimeInputValue(new Date('2008-01-15T14:00:00.000Z'))).toBe(
      '2008-01-15T12:00',
    )
  })
})

// The device may not be in Buenos Aires: nothing may depend on the time zone
// of the process. Setting TZ (vi.stubEnv writes process.env) changes the
// local time of Date in Node; that is checked first, so the test cannot pass
// by not switching.
describe('does not depend on the time zone of the device', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const zones = [
    'UTC',
    'Asia/Tokyo',
    'America/Los_Angeles',
    'Pacific/Kiritimati',
    'Pacific/Pago_Pago',
    'Asia/Kolkata',
    'Europe/Madrid',
  ]

  it.each(zones)('TZ=%s', (zone) => {
    vi.stubEnv('TZ', zone)
    const probe = new Date(Date.UTC(2026, 10, 14, 12, 0))
    const expectedOffset: Record<string, number> = {
      UTC: 0,
      'Asia/Tokyo': -540,
      'America/Los_Angeles': 480,
      'Pacific/Kiritimati': -840,
      'Pacific/Pago_Pago': 660,
      'Asia/Kolkata': -330,
      'Europe/Madrid': -60,
    }
    expect(probe.getTimezoneOffset()).toBe(expectedOffset[zone])

    expect(dateTimeInputValue(new Date('2026-11-14T16:05:00.000Z'))).toBe(
      '2026-11-14T13:05',
    )
    expect(dateTimeInputValue(new Date('2027-01-01T02:59:00.000Z'))).toBe(
      '2026-12-31T23:59',
    )
    expect(eatenAtFromInput('2026-11-14T13:05')).toBe(
      '2026-11-14T16:05:00.000Z',
    )
    expect(eatenAtFromInput('2026-12-31T23:59')).toBe(
      '2027-01-01T02:59:00.000Z',
    )
    // March 29 and October 25, 2026: daylight saving time changes in
    // Europe; March 8 and November 1: in the United States.
    for (const day of [
      Date.UTC(2026, 2, 8),
      Date.UTC(2026, 2, 29),
      Date.UTC(2026, 9, 25),
      Date.UTC(2026, 10, 1),
    ]) {
      for (let minute = 0; minute < 24 * 60; minute += 17) {
        const date = new Date(day + minute * 60_000)
        expect(eatenAtFromInput(dateTimeInputValue(date))).toBe(
          date.toISOString(),
        )
      }
    }
    expect(eatenAtFromInput('2026-02-29T10:00')).toBeNull()
  })
})
