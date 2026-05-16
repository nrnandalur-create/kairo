import { calcBBPosition, calcRSI, calcMACD } from '../utils/indicators'

function fmtCap(n) {
  if (!n) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}

export async function fetchAnalysis({ ticker, quote, profile, metrics, candles }) {
  // Pre-compute indicators client-side so the server doesn't need the full candle array
  const bb   = calcBBPosition(candles)
  const rsi  = calcRSI(candles)
  const macd = calcMACD(candles)

  const recentCandles = (candles ?? []).slice(-10)

  const priceChange5d = candles?.length >= 5
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
      indicators: { bb, rsi, macd },
      recentCandles,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error ?? `Analysis failed (${response.status})`)
  }

  return response.json()
}
