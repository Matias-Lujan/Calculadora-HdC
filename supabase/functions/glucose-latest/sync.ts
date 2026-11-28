import type { LatestOutcome, LatestResult } from './latest.ts'
import type { GraphReading, LibreSession } from './provider.ts'

// When glucose-latest saves the graph of LibreLinkUp in glucose_readings and
// which readings it keeps (docs/spec.md §9.8, M10), without Deno nor the
// database. index.ts reads and saves.

/** The graph is saved at most once every 15 min. */
export const GRAPH_SYNC_MS = 15 * 60 * 1000

/**
 * The live reading is saved at most once every 5 min (docs/decisiones.md
 * #110): real readings of the sensor, so the chart does not lose any while
 * the graph comes late. With the app open all day, about 288 rows plus the
 * ~96 of the graph.
 */
export const LATEST_SAVE_MS = 5 * 60 * 1000

/** Only the last 24 hours are kept. */
export const KEEP_MS = 24 * 60 * 60 * 1000

/** A reading a little ahead of the server clock is kept; more, it is not. */
export const FUTURE_MS = 5 * 60 * 1000

/**
 * True if the graph has to be saved: never saved, 15 min or more since the
 * last time, or a last time in the future (a wrong clock must not stop it).
 */
export function isGraphDue(syncedAt: number | null, now: number): boolean {
  return syncedAt === null || syncedAt > now || now - syncedAt >= GRAPH_SYNC_MS
}

/**
 * What to read the graph with, or null if this call must not read it: only
 * after a good read of a connection, with a session, when it is due, and
 * never in a call that logged in, so a call never makes more than the four
 * calls the app waits for (spec §9.8).
 */
export function shouldSyncGraph(
  outcome: Pick<LatestOutcome, 'result' | 'state' | 'loggedIn'>,
  syncedAt: number | null,
  now: number,
): { patientId: string; session: LibreSession } | null {
  const { result, state, loggedIn } = outcome
  if (!result.ok || result.patientId === null) return null
  if (state.session === null || loggedIn) return null
  if (!isGraphDue(syncedAt, now)) return null
  return { patientId: result.patientId, session: state.session }
}

/**
 * The readings to save: those of the last 24 hours (the border included)
 * and up to 5 min ahead, once per time (the first one wins).
 */
export function readingsToKeep(
  readings: readonly GraphReading[],
  now: number,
): GraphReading[] {
  const seen = new Set<number>()
  const kept: GraphReading[] = []
  for (const reading of readings) {
    const ms = Date.parse(reading.measured_at)
    if (Number.isNaN(ms) || ms < now - KEEP_MS || ms > now + FUTURE_MS) {
      continue
    }
    if (seen.has(ms)) continue
    seen.add(ms)
    kept.push(reading)
  }
  return kept
}

/**
 * The live reading of a good read, as a reading to save, or null: none, or
 * outside the readings kept (24 h back, 5 min ahead). The graph of
 * LibreLinkUp comes 15 to 30 min late, so without it the last stretch of
 * the chart would be missing (docs/decisiones.md #110).
 */
export function latestToKeep(
  result: LatestResult,
  now: number,
): GraphReading | null {
  if (!result.ok || result.reading === null) return null
  const { measured_at, mgdl } = result.reading
  return readingsToKeep([{ measured_at, mgdl }], now)[0] ?? null
}

/**
 * True if the live reading has to be saved: no saved reading of the user,
 * or the newest one LATEST_SAVE_MS or more before it. At most one every
 * 5 min, so the app open all day does not save one a minute.
 */
export function shouldSaveLatest(
  latestMeasuredAt: number,
  newestSavedAt: number | null,
): boolean {
  return (
    newestSavedAt === null || latestMeasuredAt - newestSavedAt >= LATEST_SAVE_MS
  )
}

/** Readings measured before this time (ISO) are deleted. */
export function cutoffIso(now: number): string {
  return new Date(now - KEEP_MS).toISOString()
}

/**
 * True if the request comes from the scheduled sync: its `apikey` header is
 * the secret key of the project. Compared in constant time, so the answer
 * time does not tell how much of a guess was right.
 */
export function isTaskRequest(
  apikey: string | null,
  secretKey: string,
): boolean {
  if (apikey === null || secretKey === '') return false
  const given = new TextEncoder().encode(apikey)
  const expected = new TextEncoder().encode(secretKey)
  let difference = given.length ^ expected.length
  for (let index = 0; index < expected.length; index++) {
    difference |= (given[index] ?? 0) ^ (expected[index] ?? 0)
  }
  return difference === 0
}
