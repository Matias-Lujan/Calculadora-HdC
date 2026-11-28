import { useEffect, useState } from 'react'

/** How often the time is brought up to date. */
const CLOCK_MS = 15_000

/**
 * The time now, brought up to date every 15 s and when the app comes back
 * in sight, so "hace X min" and the 24-hour chart do not stay behind while
 * the readings do not change.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, CLOCK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}
