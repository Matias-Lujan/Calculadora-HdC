import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dateTimeInputValue,
  eatenAtFromInput,
  eatenDay,
  formatDayTitle,
  formatEatenAt,
  formatEatenTime,
  formatMealMoment,
  ofMealMoment,
  secondOfDayAt,
} from './eatenAt.ts'

// The time zone of the process when the file loads. vi.unstubAllEnvs()
// deletes TZ, but Node does not go back to the system zone after that: the
// tests that change TZ assign this one back, so the rest of the file runs
// in it and not in the last zone they tried. vi.stubEnv writes process.env
// (the app tsconfig has no Node types, so `process` is not used directly).
const initialTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

function restoreTimeZone() {
  vi.unstubAllEnvs()
  vi.stubEnv('TZ', initialTimeZone)
}

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
  afterEach(restoreTimeZone)

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

describe('formatEatenAt', () => {
  it.each([
    // As PostgREST returns it, with and without milliseconds.
    ['2026-11-14T16:05:00+00:00', '14/11/2026 13:05'],
    ['2026-11-14T16:05:00.123+00:00', '14/11/2026 13:05'],
    // The seconds are dropped, not rounded.
    ['2026-11-14T16:05:59.999Z', '14/11/2026 13:05'],
    // Midnight is "00", not "24".
    ['2026-11-15T03:00:00+00:00', '15/11/2026 00:00'],
    // Another day, month and year in Buenos Aires.
    ['2026-11-15T02:59:00Z', '14/11/2026 23:59'],
    ['2026-12-01T01:00:00Z', '30/11/2026 22:00'],
    ['2027-01-01T02:30:00Z', '31/12/2026 23:30'],
    ['2028-02-29T15:00:00Z', '29/02/2028 12:00'],
    // Another offset, same instant.
    ['2026-11-14T13:05:00-03:00', '14/11/2026 13:05'],
    // Every part padded.
    ['2026-01-02T06:04:00Z', '02/01/2026 03:04'],
  ])('%s → %s', (iso, text) => {
    expect(formatEatenAt(iso)).toBe(text)
  })

  it('shows the same clock as the date field, for the same instant', () => {
    const start = Date.UTC(2026, 10, 14, 3, 0)
    for (let minute = 0; minute < 3 * 24 * 60; minute += 37) {
      const date = new Date(start + minute * 60_000 + 59_999)
      const [day, time] = dateTimeInputValue(date).split('T')
      const [year, month, dayOfMonth] = (day ?? '').split('-')
      expect(formatEatenAt(date.toISOString())).toBe(
        `${dayOfMonth}/${month}/${year} ${time}`,
      )
    }
  })
})

describe('formatEatenAt: bordes', () => {
  it.each([
    // Microseconds, as Postgres can return them (Node truncates to ms).
    ['2026-11-14T16:05:59.999999+00:00', '14/11/2026 13:05'],
    // The last instant of a day in Buenos Aires stays on that day.
    ['2026-11-15T02:59:59.999Z', '14/11/2026 23:59'],
    // Buenos Aires was at UTC−2 in January 2008: the offset comes from the
    // time zone data, not a fixed −3.
    ['2008-01-15T15:00:00Z', '15/01/2008 13:00'],
    // The night the clocks went back (2008-03-16, 00:00 → 23:00).
    ['2008-03-16T01:59:00Z', '15/03/2008 23:59'],
    ['2008-03-16T02:00:00Z', '15/03/2008 23:00'],
    // The night the clocks went forward (2007-12-30, 00:00 → 01:00).
    ['2007-12-30T02:59:00Z', '29/12/2007 23:59'],
    ['2007-12-30T03:00:00Z', '30/12/2007 01:00'],
    // An offset with half hours, same instant.
    ['2026-11-14T21:35:00+05:30', '14/11/2026 13:05'],
  ])('%s → %s', (iso, text) => {
    expect(formatEatenAt(iso)).toBe(text)
  })
})

// Like the date field: the history shows Buenos Aires time whatever the time
// zone of the device (the process TZ is checked first, so the test cannot
// pass by not switching).
describe('formatEatenAt does not depend on the time zone of the device', () => {
  afterEach(restoreTimeZone)

  const expectedOffset: Record<string, number> = {
    UTC: 0,
    'Asia/Tokyo': -540,
    'America/Los_Angeles': 480,
    'Pacific/Kiritimati': -840,
    'Pacific/Pago_Pago': 660,
    'Asia/Kolkata': -330,
    'Europe/Madrid': -60,
  }

  it.each(Object.keys(expectedOffset))('TZ=%s', (zone) => {
    vi.stubEnv('TZ', zone)
    expect(new Date(Date.UTC(2026, 10, 14, 12, 0)).getTimezoneOffset()).toBe(
      expectedOffset[zone],
    )

    expect(formatEatenAt('2026-11-14T16:05:00+00:00')).toBe('14/11/2026 13:05')
    expect(formatEatenAt('2026-11-14T16:05:00.123+00:00')).toBe(
      '14/11/2026 13:05',
    )
    expect(formatEatenAt('2026-11-15T02:59:59.999Z')).toBe('14/11/2026 23:59')
    expect(formatEatenAt('2026-11-15T03:00:00+00:00')).toBe('15/11/2026 00:00')
    expect(formatEatenAt('2027-01-01T02:30:00Z')).toBe('31/12/2026 23:30')
    expect(formatEatenAt('2008-01-15T15:00:00Z')).toBe('15/01/2008 13:00')
  })
})

// The days of the history (spec §6.7, §14 #62).

describe('eatenDay', () => {
  it.each([
    ['2026-11-14T16:05:00+00:00', '2026-11-14'],
    ['2026-11-15T02:59:59.999Z', '2026-11-14'],
    ['2026-11-15T03:00:00+00:00', '2026-11-15'],
    ['2026-11-14T23:59:00-03:00', '2026-11-14'],
    ['2026-11-15T01:00:00+02:00', '2026-11-14'],
    ['2027-01-01T02:59:00Z', '2026-12-31'],
    ['2027-01-01T03:00:00Z', '2027-01-01'],
    ['2028-03-01T02:00:00Z', '2028-02-29'],
  ])('%s → %s', (iso, day) => {
    expect(eatenDay(iso)).toBe(day)
  })

  it('matches the date of formatEatenAt for every hour of a day', () => {
    for (let hour = 0; hour < 24; hour++) {
      const iso = new Date(Date.UTC(2026, 11, 31, hour, 30)).toISOString()
      const [day = '', month = '', year = ''] = formatEatenAt(iso)
        .slice(0, 10)
        .split('/')
      expect(eatenDay(iso)).toBe(`${year}-${month}-${day}`)
    }
  })
})

describe('formatEatenTime', () => {
  it.each([
    ['2026-11-14T16:05:00+00:00', '13:05'],
    ['2026-11-14T16:05:59.999Z', '13:05'],
    ['2026-11-15T03:00:00Z', '00:00'],
    ['2026-11-15T02:59:00Z', '23:59'],
    ['2026-11-14T09:07:00-03:00', '09:07'],
  ])('%s → %s', (iso, time) => {
    expect(formatEatenTime(iso)).toBe(time)
  })
})

describe('formatDayTitle', () => {
  // Monday 16/11/2026, 10:00 in Buenos Aires.
  const now = new Date('2026-11-16T13:00:00Z')

  it('today and yesterday', () => {
    expect(formatDayTitle('2026-11-16', now)).toBe('Hoy')
    expect(formatDayTitle('2026-11-15', now)).toBe('Ayer')
  })

  it('another day of this year: the day of the week and the date', () => {
    expect(formatDayTitle('2026-11-14', now)).toBe('sábado 14/11')
    expect(formatDayTitle('2026-11-09', now)).toBe('lunes 09/11')
    expect(formatDayTitle('2026-01-01', now)).toBe('jueves 01/01')
    expect(formatDayTitle('2026-11-11', now)).toBe('miércoles 11/11')
  })

  it('another year: with the year', () => {
    expect(formatDayTitle('2025-12-31', now)).toBe('miércoles 31/12/2025')
    expect(formatDayTitle('2024-02-29', now)).toBe('jueves 29/02/2024')
  })

  it('a future day: its date, also tomorrow', () => {
    expect(formatDayTitle('2026-11-17', now)).toBe('martes 17/11')
    expect(formatDayTitle('2027-01-01', now)).toBe('viernes 01/01/2027')
  })

  it('today is the day of Buenos Aires, not the one of UTC', () => {
    // 23:30 of the 16th in Buenos Aires is 02:30 UTC of the 17th.
    const late = new Date('2026-11-17T02:30:00Z')
    expect(formatDayTitle('2026-11-16', late)).toBe('Hoy')
    expect(formatDayTitle('2026-11-15', late)).toBe('Ayer')
    expect(formatDayTitle('2026-11-17', late)).toBe('martes 17/11')
    // And 00:00 of the 17th.
    const midnight = new Date('2026-11-17T03:00:00Z')
    expect(formatDayTitle('2026-11-17', midnight)).toBe('Hoy')
    expect(formatDayTitle('2026-11-16', midnight)).toBe('Ayer')
  })

  it('across the change of month and year', () => {
    const newYear = new Date('2027-01-01T12:00:00Z')
    expect(formatDayTitle('2027-01-01', newYear)).toBe('Hoy')
    expect(formatDayTitle('2026-12-31', newYear)).toBe('Ayer')
    expect(formatDayTitle('2026-12-30', newYear)).toBe('miércoles 30/12/2026')
    const march = new Date('2028-03-01T12:00:00Z')
    expect(formatDayTitle('2028-02-29', march)).toBe('Ayer')
    expect(formatDayTitle('2028-02-28', march)).toBe('lunes 28/02')
  })
})

describe('the days do not depend on the time zone of the device', () => {
  afterEach(restoreTimeZone)

  it.each(['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'TZ=%s',
    (zone) => {
      vi.stubEnv('TZ', zone)
      expect(eatenDay('2026-11-15T02:59:59.999Z')).toBe('2026-11-14')
      expect(eatenDay('2026-11-15T03:00:00Z')).toBe('2026-11-15')
      expect(formatEatenTime('2026-11-15T02:59:00Z')).toBe('23:59')
      const late = new Date('2026-11-17T02:30:00Z')
      expect(formatDayTitle('2026-11-16', late)).toBe('Hoy')
      expect(formatDayTitle('2026-11-15', late)).toBe('Ayer')
      expect(formatDayTitle('2026-11-14', late)).toBe('sábado 14/11')
    },
  )
})

describe('formatDayTitle: bordes (added by the tester)', () => {
  it('"Ayer" on 1 January at 00:00 of Buenos Aires is 31 December', () => {
    // 00:00 of 01/01/2027 in Buenos Aires is 03:00 UTC; one ms before, still 2026.
    const midnight = new Date('2027-01-01T03:00:00Z')
    expect(formatDayTitle('2027-01-01', midnight)).toBe('Hoy')
    expect(formatDayTitle('2026-12-31', midnight)).toBe('Ayer')
    const lastMs = new Date('2027-01-01T02:59:59.999Z')
    expect(formatDayTitle('2026-12-31', lastMs)).toBe('Hoy')
    expect(formatDayTitle('2026-12-30', lastMs)).toBe('Ayer')
    expect(formatDayTitle('2027-01-01', lastMs)).toBe('viernes 01/01/2027')
  })

  it('"Ayer" on 1 March of a year that is not leap is 28 February', () => {
    const march = new Date('2027-03-01T12:00:00Z')
    expect(formatDayTitle('2027-02-28', march)).toBe('Ayer')
  })
})

// --- Added by the tester ---

// Last in the file (vitest runs the tests in order): the tests that change
// TZ leave the process in the zone it had when the file loaded, not in the
// last one they tried.
describe('the time zone tests leave the zone of the process as it was', () => {
  const probe = new Date(Date.UTC(2026, 10, 14, 12, 0))
  // Read while collecting, before any test runs.
  const before = {
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset: probe.getTimezoneOffset(),
  }

  it('the same zone and offset after them', () => {
    expect(before.zone).toBe(initialTimeZone)
    expect({
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offset: probe.getTimezoneOffset(),
    }).toEqual(before)
  })
})

// The shortcuts of Inicio (spec §6.6): the time of day and the moment of a
// meal, in Buenos Aires (UTC−3).
describe('secondOfDayAt', () => {
  it.each([
    ['2026-11-16T03:00:00Z', 0], // midnight in Buenos Aires
    ['2026-11-16T02:59:59Z', 86399], // a second before
    ['2026-11-16T16:05:30Z', 13 * 3600 + 5 * 60 + 30],
    ['2026-11-16T00:00:00Z', 21 * 3600], // midnight UTC is 21:00
  ])('%s is second %i', (iso, second) => {
    expect(secondOfDayAt(Date.parse(iso))).toBe(second)
  })

  it('does not depend on the time zone of the device', () => {
    try {
      vi.stubEnv('TZ', 'Asia/Tokyo')
      expect(secondOfDayAt(Date.parse('2026-11-16T03:00:00Z'))).toBe(0)
    } finally {
      restoreTimeZone()
    }
  })
})

describe('formatMealMoment and ofMealMoment', () => {
  // Monday 16/11/2026, 13:00 in Buenos Aires.
  const now = new Date('2026-11-16T16:00:00Z')

  it.each([
    ['2026-11-16T11:30:00+00:00', 'Hoy 08:30', 'de hoy 08:30'],
    ['2026-11-15T11:30:00+00:00', 'Ayer 08:30', 'de ayer 08:30'],
    // 23:30 of Saturday in Buenos Aires, already Sunday in UTC.
    [
      '2026-11-15T02:30:00+00:00',
      'sábado 14/11 23:30',
      'del sábado 14/11 23:30',
    ],
    [
      '2025-12-31T15:00:00+00:00',
      'miércoles 31/12/2025 12:00',
      'del miércoles 31/12/2025 12:00',
    ],
  ])('%s: "%s", "%s"', (iso, row, notice) => {
    expect(formatMealMoment(iso, now)).toBe(row)
    expect(ofMealMoment(iso, now)).toBe(notice)
  })
})
