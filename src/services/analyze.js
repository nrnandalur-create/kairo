import { calcBBPosition, calcRSI, calcMACD } from '../utils/indicators'

function fmtCap(n) {
  if (!n) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}

export async function fetchAnalysis({ ticker, quote, profile, metrics, candles, synthetic }) {
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
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error ?? `Analysis failed (${response.status})`)
  }

  const data = await response.json()
  return { ...data, fetchedAt: Date.now() }
}
