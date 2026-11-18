// The date and time of a meal (spec §6.6), between the value of an
// <input type="datetime-local"> ("2026-11-14T13:05", a wall-clock time in
// Buenos Aires) and the instant saved in `eaten_at` (an ISO string), and how
// the history shows it. Only UTC methods of Date and Intl.DateTimeFormat
// with the time zone are used: never the device's local time, which may not
// be Buenos Aires.

const TIME_ZONE = 'America/Argentina/Buenos_Aires'

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type WallClock = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** The date and time a Buenos Aires clock shows at an instant. */
function wallClockAt(time: number): WallClock {
  const parts: Record<string, number> = {}
  for (const part of wallClock.formatToParts(time)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year ?? NaN,
    month: parts.month ?? NaN,
    day: parts.day ?? NaN,
    hour: parts.hour ?? NaN,
    minute: parts.minute ?? NaN,
    second: parts.second ?? NaN,
  }
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/**
 * The value of a datetime-local field for an instant: "YYYY-MM-DDTHH:mm",
 * in Buenos Aires time, 24 h (midnight is "00"). The seconds are dropped,
 * not rounded.
 */
export function dateTimeInputValue(date: Date): string {
  const c = wallClockAt(date.getTime())
  return `${pad(c.year, 4)}-${pad(c.month, 2)}-${pad(c.day, 2)}T${pad(c.hour, 2)}:${pad(c.minute, 2)}`
}

/**
 * The date and time of a saved meal, for the history: "dd/mm/aaaa HH:mm",
 * in Buenos Aires time, 24 h. `iso` is the `eaten_at` read from the base
 * (with an offset, already validated). The seconds are dropped, not rounded.
 */
export function formatEatenAt(iso: string): string {
  const c = wallClockAt(Date.parse(iso))
  return `${pad(c.day, 2)}/${pad(c.month, 2)}/${pad(c.year, 4)} ${pad(c.hour, 2)}:${pad(c.minute, 2)}`
}

const INPUT_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * The instant (ISO string) of a datetime-local value read as Buenos Aires
 * time, or null if it is not a complete, existing date and time (empty,
 * February 30, 24:00, minute 60, a year below 100, another format).
 */
export function eatenAtFromInput(text: string): string | null {
  const match = INPUT_VALUE.exec(text)
  if (match === null) return null
  const [year, month, day, hour, minute, second] = match
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part)))
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return null
  }

  // The typed clock reading taken as if it were UTC, and the offset of
  // Buenos Aires at that moment: the clock there shows guess + offset.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  const c = wallClockAt(guess)
  const offset =
    Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - guess
  const instant = guess - offset

  // Date.UTC rolls over invalid values (February 30 becomes March 2) and
  // reads years 0–99 as 1900–1999: if the instant does not show the same
  // date and time, the text was not a real one.
  if (dateTimeInputValue(new Date(instant)) !== text.slice(0, 16)) return null
  return new Date(instant).toISOString()
}

// The days of the history (spec §6.7): a meal belongs to the calendar day of
// Buenos Aires it was eaten in. A day is identified by "YYYY-MM-DD".

/** The day of Buenos Aires of an instant, "YYYY-MM-DD". */
function dayAt(time: number): string {
  const c = wallClockAt(time)
  return `${pad(c.year, 4)}-${pad(c.month, 2)}-${pad(c.day, 2)}`
}

/** The day of Buenos Aires a saved meal was eaten in: "YYYY-MM-DD". */
export function eatenDay(iso: string): string {
  return dayAt(Date.parse(iso))
}

/** The time of a saved meal, for the history: "HH:mm", Buenos Aires, 24 h. */
export function formatEatenTime(iso: string): string {
  const c = wallClockAt(Date.parse(iso))
  return `${pad(c.hour, 2)}:${pad(c.minute, 2)}`
}

/**
 * The second of the day a Buenos Aires clock shows at an instant, from 0
 * (00:00:00) to 86399 (23:59:59).
 */
export function secondOfDayAt(time: number): number {
  const c = wallClockAt(time)
  return c.hour * 3600 + c.minute * 60 + c.second
}

/**
 * The days of Buenos Aires that are "Hoy" and "Ayer" at `now`, as
 * "YYYY-MM-DD" (eatenDay).
 */
export function todayAndYesterday(now: Date): [string, string] {
  const today = dayAt(now.getTime())
  const [year = NaN, month = NaN, day = NaN] = today.split('-').map(Number)
  // Calendar arithmetic in UTC (no time zone): the day before today.
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1))
  return [today, yesterday.toISOString().slice(0, 10)]
}

const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
]

/**
 * The title of a day of the history: "Hoy", "Ayer", or the day of the week
 * and the date ("lunes 09/11"), with the year if it is not the current one
 * ("viernes 31/12/2027"). `day` is "YYYY-MM-DD" (eatenDay); today is the day
 * of Buenos Aires at `now`. A future day is shown with its date.
 */
export function formatDayTitle(day: string, now: Date): string {
  const [today, yesterday] = todayAndYesterday(now)
  if (day === today) return 'Hoy'
  if (day === yesterday) return 'Ayer'
  const [year = NaN, month = NaN, dayOfMonth = NaN] = day.split('-').map(Number)
  const todayYear = Number(today.slice(0, 4))

  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay()] ?? ''
  const date = `${pad(dayOfMonth, 2)}/${pad(month, 2)}`
  return year === todayYear
    ? `${weekday} ${date}`
    : `${weekday} ${date}/${pad(year, 4)}`
}

/**
 * When a saved meal was eaten, for a row of Inicio: "Ayer 08:30", "Hoy
 * 13:05", "lunes 09/11 08:30" (the day as formatDayTitle names it and the
 * time, Buenos Aires).
 */
export function formatMealMoment(iso: string, now: Date): string {
  return `${formatDayTitle(eatenDay(iso), now)} ${formatEatenTime(iso)}`
}

/**
 * When a saved meal was eaten, for its detail: "Ayer, 21:00", "Hoy, 13:05",
 * "sábado 14/11, 13:05" (the day as formatDayTitle names it, a comma and the
 * time, Buenos Aires).
 */
export function formatMealDateTime(iso: string, now: Date): string {
  return `${formatDayTitle(eatenDay(iso), now)}, ${formatEatenTime(iso)}`
}

/**
 * The same, after "la comida": "de ayer 08:30", "de hoy 13:05", "del lunes
 * 09/11 08:30".
 */
export function ofMealMoment(iso: string, now: Date): string {
  const title = formatDayTitle(eatenDay(iso), now)
  const time = formatEatenTime(iso)
  if (title === 'Hoy' || title === 'Ayer') {
    return `de ${title.toLowerCase()} ${time}`
  }
  return `del ${title} ${time}`
}
