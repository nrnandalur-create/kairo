import { useEffect, useRef } from 'react'
import { getMarketState } from '../utils/marketHours'

// Re-runs `refresh()` on a cadence that adapts to the market state so the
// displayed RSI / MACD / BB stay within ~0.5 of the reference at all times:
//   ▸ market OPEN     → every 30s (price moves fastest; tight cadence)
//   ▸ pre / after-hrs → every 90s (slower moves, less liquidity)
//   ▸ closed (overnight / weekend / holiday) → paused (no point burning quotes)
//
// Always skips when the document is hidden (user on another tab) — modern
// browsers throttle setInterval there anyway, so we make it explicit.
//
// Resets whenever `key` changes — switching tickers starts a fresh window
// so the user gets a full interval on the new symbol.
//
//   useAutoRefresh({ key: ticker, refresh: () => fetchMarketOnly(ticker) })
export function useAutoRefresh({ key, refresh, intervalMs }) {
  // Keep a ref to the latest refresh so we don't have to re-arm the
  // interval every time the parent re-renders with a fresh closure.
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])

  useEffect(() => {
    if (!key) return
    // We poll on a SHORT base interval and decide per-tick whether to fire
    // based on the live market state. This handles the regular-session
    // open at 09:30 ET without a stale window — at the moment the state
    // flips from "pre" to "open" the cadence tightens automatically.
    const BASE_INTERVAL = 30_000
    const explicitMs = Number.isFinite(intervalMs) ? intervalMs : null

    let lastFireAt = 0
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const state = getMarketState(new Date()).state
      if (state === 'closed') return
      const now = Date.now()
      // Choose desired cadence based on market state OR the user's explicit
      // override (Settings → refresh interval).
      const desired = explicitMs ?? (state === 'open' ? 30_000 : 90_000)
      if (now - lastFireAt < desired) return
      lastFireAt = now
      refreshRef.current?.()
    }

    const id = setInterval(tick, BASE_INTERVAL)
    return () => clearInterval(id)
  }, [key, intervalMs])
}
