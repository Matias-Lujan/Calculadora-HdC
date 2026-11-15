/** Label readings per user per day, counted in vision_requests (spec §9.3). */
export const DAILY_CAP = 30

const BUENOS_AIRES_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
})

/**
 * Start of the current calendar day in Buenos Aires, as a timestamp with
 * offset ("2026-11-15T00:00:00-03:00"). The offset is fixed: Argentina has
 * no daylight saving time since 2009. If it ever comes back, the cap would
 * reset one hour off for part of the year, which is harmless.
 */
export function startOfToday(now: Date): string {
  // en-CA formats the date as YYYY-MM-DD.
  return `${BUENOS_AIRES_DATE.format(now)}T00:00:00-03:00`
}
