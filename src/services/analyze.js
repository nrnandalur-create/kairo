import { calcBBPosition, calcRSI, calcMACD } from '../utils/indicators'

// Cap the client-side wait for the Groq round-trip. The server already
// aborts its own upstream fetch at 8s and returns a 504, so 15s here gives
// the response comfortable room to arrive before the client bails. Anything
// beyond that indicates a network stall — the user should see a clean
// timeout state, not a spinner that never resolves.
const CLIENT_ANALYSIS_TIMEOUT_MS = 15_000

// ── Shared body builder ─────────────────────────────────────────────────────
// Both callers post the SAME market context (numbers) so the two AI panels
// interpret the same data differently rather than reasoning from divergent
// inputs. Only the `type` field distinguishes verdict vs analysis.
function buildRequestBody({ ticker, quote, profile, metrics, candles, synthetic }, type) {
  // CRITICAL: when candles are synthetic (no real OHLC source available), we
  // strip technical indicators + recent candles from the prompt entirely so
  // neither the verdict nor the analysis is anchored to noise.
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

  return {
    ticker,
    type,
    quote: { ...quote, priceChange5d },
    profile: {
      name:                 profile?.name,
      finnhubIndustry:      profile?.finnhubIndustry,
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
  }
}

// ── Signal composition ──────────────────────────────────────────────────────
// Combines the outer abort signal (ticker switch) with a fresh 15 s timer so
// either cancellation lands as an AbortError. Returns { signal, cleanup }.
function composeSignals(outerSignal) {
  const timeoutCtrl = new AbortController()
  const timeoutId   = setTimeout(() => timeoutCtrl.abort('analyze:client-timeout'), CLIENT_ANALYSIS_TIMEOUT_MS)
  const onOuterAbort = () => timeoutCtrl.abort(outerSignal?.reason ?? 'analyze:outer-abort')
  if (outerSignal) {
    if (outerSignal.aborted) timeoutCtrl.abort(outerSignal.reason ?? 'analyze:outer-abort-preexisting')
    else outerSignal.addEventListener('abort', onOuterAbort, { once: true })
  }
  const cleanup = () => {
    clearTimeout(timeoutId)
    if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort)
  }
  return { signal: timeoutCtrl.signal, cleanup, isOuterAborted: () => !!outerSignal?.aborted }
}

// ── Shared post-and-parse helper ────────────────────────────────────────────
async function postToAnalyze(body, outerSignal) {
  const { signal, cleanup, isOuterAborted } = composeSignals(outerSignal)
  try {
    const response = await fetch('/api/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error ?? `Analysis failed (${response.status})`)
    }

    const data = await response.json()
    return { ...data, fetchedAt: Date.now() }
  } catch (err) {
    if (err?.name === 'AbortError' || /abort/i.test(String(err?.message ?? ''))) {
      // Preserve AbortError for App.jsx to swallow on ticker-switch aborts.
      if (isOuterAborted()) throw err
      const e = new Error('Analysis request timed out after 15s. Groq is slow right now — try again in a moment.')
      e.name = 'TimeoutError'
      throw e
    }
    throw err
  } finally {
    cleanup()
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

// Punchy verdict — feeds the AI Recommendation panel.
// Schema: { verdict, confidence, riskLevel, entryPrice, stopLoss, summary, entryReason, stopReason }
export async function fetchVerdict(marketContext, { signal } = {}) {
  return postToAnalyze(buildRequestBody(marketContext, 'verdict'), signal)
}

// Detailed technical workup — feeds the AI Analysis panel.
// Schema: { rsiAnalysis, macdAnalysis, bbAnalysis, vwapAnalysis, volumeAnalysis,
//           indicatorConfluence, rangeContext, fundamentalContext }
export async function fetchDetailedAnalysis(marketContext, { signal } = {}) {
  return postToAnalyze(buildRequestBody(marketContext, 'analysis'), signal)
}

// Back-compat alias — some call sites still import { fetchAnalysis } expecting
// the verdict schema. Keeping this as a thin wrapper avoids a wide edit and
// keeps the signal-alert path (which reads verdict fields) working.
export const fetchAnalysis = fetchVerdict
