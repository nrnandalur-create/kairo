import { useEffect, useState } from 'react'

// Returns a Date that re-renders on the given interval.
// 1000ms for live wall clocks; 60_000ms for "X mins ago" labels.
//
// Why a custom hook instead of inline setInterval: a single hook means
// multiple consumers at the same cadence don't each spin up their own timer.
// React will still coalesce re-renders for consumers reading the same value.
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
