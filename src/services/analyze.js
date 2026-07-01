import { calcBBPosition, calcRSI, calcMACD } from '../utils/indicators'

function fmtCap(n) {
  if (!n) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}

// Cap the client-side wait for the Groq round-trip. The server already
// aborts its own upstream fetch at 8s and returns a 504, so 15s here gives
// the response comfortable room to arrive before the client bails. Anything
// beyond that indicates a network stall — the user should see a clean
// timeout state, not a spinner that never resolves.
const CLIENT_ANALYSIS_TIMEOUT_MS = 15_000

export async function fetchAnalysis({ ticker, quote, profile, metrics, candles, synthetic }, { signal: outerSignal } = {}) {
  // CRITICAL: when candles are synthetic (no real OHLC source available), we
  // strip technical indicators + recent candles from the prompt entirely so
  // the AI verdict isn't anchored to noise. We tell the model explicitly so
  // it knows to lean on quote + fundamentals only and lower confidence.
  const useReal       = !synthetic && candles?.length
  // Pass quote.c so the AI receives intraday-aware indicator values that
  // match what the user sees on the IndicatorsGrid + MetricsBar surfaces.
  const bb            = useReal ? calcBBPosition(candles, 20, quote?.c) : null
  const rsi           = useReal ? calcRSI(candles, 14, quote?.c)        : null
  const macd          = useReal ? calcMACD(candles, quote?.c)           : null
  const recentCandles = useReal ? candles.slice(-10)      : []
  const priceChange5d = useReal && candles.length >= 5
    ? (((candles.at(-1).close - candles.at(-5).close) / candles.at(-5).close) * 100).toFixed(2)
    : 'N/A'

  // Compose the outer signal (from App.jsx — fires on ticker switch) with
  // a fresh timeout signal so both cancellation paths land as an AbortError.
  // The outer signal wins if it fires first, otherwise the timeout guarantees
  // we never hang past 15s.
  const timeoutCtrl = new AbortController()
  const timeoutId = setTimeout(() => timeoutCtrl.abort('analyze:client-timeout'), CLIENT_ANALYSIS_TIMEOUT_MS)
  const onOuterAbort = () => timeoutCtrl.abort(outerSignal.reason ?? 'analyze:outer-abort')
  if (outerSignal) {
    if (outerSignal.aborted) timeoutCtrl.abort(outerSignal.reason ?? 'analyze:outer-abort-preexisting')
    else outerSignal.addEventListener('abort', onOuterAbort, { once: true })
  }

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        quote: { ...quote, priceChange5d },
        profile: {
          name: profile?.name,
          finnhubIndustry: profile?.finnhubIndustry,
          marketCapitalization: profile?.marketCapitalization,
        },
        metrics: {
          metric: {
            peBasicExclExtraTTM: metrics?.metric?.peBasicExclExtraTTM,
            epsGrowth5Y:         metrics?.metric?.epsGrowth5Y,
            beta:                metrics?.metric?.beta,
            '52WeekHigh':        metrics?.metric?.['52WeekHigh'],
            '52WeekLow':         metrics?.metric?.['52WeekLow'],
          },
        },
        indicators: useReal ? { bb, rsi, macd } : null,
        recentCandles,
        // Flag so the API can prepend a no-technicals instruction to the prompt.
        noTechnicals: !useReal,
      }),
      signal: timeoutCtrl.signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error ?? `Analysis failed (${response.status})`)
    }

    const data = await response.json()
    return { ...data, fetchedAt: Date.now() }
  } catch (err) {
    // Rethrow as a stable "timeout" message the <Unavailable> card recognizes.
    if (err?.name === 'AbortError' || /abort/i.test(String(err?.message ?? ''))) {
      // If the abort came from the outer signal (ticker switch), preserve the
      // AbortError so App.jsx can filter it silently. Only convert to a user-
      // facing timeout when it was the client-side 15s timer that fired.
      if (outerSignal?.aborted) throw err
      const e = new Error('Analysis request timed out after 15s. Groq is slow right now — try again in a moment.')
      e.name = 'TimeoutError'
      throw e
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort)
  }
}
