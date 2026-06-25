import { useEffect, useRef } from 'react'
import { getMarketState } from '../utils/marketHours'

// Re-runs `refresh()` every `intervalMs` while `key` is non-null.
// Skips ticks when:
//   ▸ the document is hidden (user is on another tab)
//   ▸ the US equities market is closed (no point burning quotes)
//
// Resets the interval whenever `key` changes — switching tickers starts
// a fresh window so the user gets a full interval on the new symbol.
//
//   useAutoRefresh({
//     key: ticker,                                 // null = paused
//     refresh: () => fetchMarketOnly(ticker),      // your refetch fn
//     intervalMs: 300_000,                         // default 5 min
//   })
export function useAutoRefresh({ key, refresh, intervalMs = 300_000 }) {
  // Keep a ref to the latest refresh so we don't have to re-arm the
  // interval every time the parent re-renders with a fresh closure.
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])

  useEffect(() => {
    if (!key) return
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (getMarketState(new Date()).state === 'closed') return
      refreshRef.current?.()
    }
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [key, intervalMs])
}
