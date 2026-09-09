import { calcBBPosition, calcRSI, calcMACD, calcSMA, calcVolumeSignal, calcSR, calcATR } from '../utils/indicators'
import { authHeaders, describeApiError } from '../lib/authHeader'

// Build labeled support/resistance levels from real calculations (moving
// averages + swing pivots), nearest-first, each tagged with its source so the
// engine can explain WHY a level matters (spec §3).
function buildLevels({ price, sr, sma20, sma50 }) {
  if (!Number.isFinite(price)) return { support: [], resistance: [] }
  const support = [], resistance = []
  for (const [val, source] of [[sma20, '20-day SMA'], [sma50, '50-day SMA']]) {
    if (val == null) continue
    const type = val < price ? 'support' : 'resistance'
    ;(type === 'support' ? support : resistance).push({ price: +val.toFixed(2), type, source })
  }
  for (const s of (sr?.support ?? []))    support.push({ price: s, type: 'support', source: 'a recent swing low' })
  for (const r of (sr?.resistance ?? [])) resistance.push({ price: r, type: 'resistance', source: 'a recent swing high' })
  const byNear = (a, b) => Math.abs(price - a.price) - Math.abs(price - b.price)
  return { support: support.sort(byNear).slice(0, 4), resistance: resistance.sort(byNear).slice(0, 4) }
}

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
  // Extra evidence the unified decision engine combines server-side: trend
  // structure (SMA50/200), participation (volume), and real S/R levels for the
  // "what would change the thesis" section. Computed here because the client
  // already holds the full candle history.
  const sma50         = useReal ? calcSMA(candles, 50,  quote?.c) : null
  const sma200        = useReal ? calcSMA(candles, 200, quote?.c) : null
  const sma20         = useReal ? calcSMA(candles, 20,  quote?.c) : null
  const volume        = useReal ? calcVolumeSignal(candles)       : null
  // Labeled S/R levels — every level carries {price, type, source} so the
  // engine can say "a close below the 50-day SMA near $148.51", never an
  // unexplained number (spec §3). Sources come from real calculations only.
  const sr            = useReal ? buildLevels({ price: quote?.c, sr: calcSR(candles, quote?.c), sma20, sma50 }) : null
  const atr           = useReal ? calcATR(candles, 14) : null
  const atrPct        = atr != null && quote?.c ? +((atr / quote.c) * 100).toFixed(2) : null
  const historyLen    = useReal ? candles.length : 0
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
    // Engine-only evidence (ignored by the analysis LLM path).
    sma20,
    sma50,
    sma200,
    atrPct,
    historyLen,
    asOf: Date.now(),
    volume: volume ? { ratio: volume.ratio, above: volume.above } : null,
    sr,
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
    // Server is authoritative for auth + entitlement + quota; forward the JWT.
    const headers = await authHeaders({ 'Content-Type': 'application/json' })
    const response = await fetch('/api/analyze', {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      // Map 401 / 403 / 429 (quota_exceeded) to a friendly message; the server
      // decision always wins over any optimistic client-side quota state.
      const e = new Error(describeApiError(response.status, err))
      e.code   = err?.error ?? null
      e.status = response.status
      throw e
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
