import { rateLimit } from './_rateLimit.js'
import { validateTicker } from './_validate.js'

const AV_BASE = 'https://www.alphavantage.co/query'

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null
  const ch = closes.slice(1).map((c, i) => c - closes[i])
  let g = ch.slice(0, period).reduce((a, b) => a + Math.max(b, 0), 0) / period
  let l = ch.slice(0, period).reduce((a, b) => a + Math.max(-b, 0), 0) / period
  for (let i = period; i < ch.length; i++) {
    g = (g * (period - 1) + Math.max(ch[i], 0)) / period
    l = (l * (period - 1) + Math.max(-ch[i], 0)) / period
  }
  return l === 0 ? 100 : Math.round(100 - 100 / (1 + g / l))
}

function calcBBPct(closes, period = 20) {
  if (closes.length < period) return null
  const sl   = closes.slice(-period)
  const mean = sl.reduce((a, b) => a + b, 0) / period
  const std  = Math.sqrt(sl.reduce((s, c) => s + (c - mean) ** 2, 0) / period)
  if (std === 0) return 50
  const upper = mean + 2 * std
  const lower = mean - 2 * std
  return Math.round(Math.max(0, Math.min(100, ((closes.at(-1) - lower) / (upper - lower)) * 100)))
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const ticker = validateTicker(req.query.ticker)
  if (!ticker) return res.status(400).json({ error: 'invalid ticker' })

  const apiKey = process.env.ALPHA_VANTAGE_KEY
  if (!apiKey) return res.status(500).json({ error: 'unavailable' })

  try {
    const url   = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`
    const avRes = await fetch(url)
    if (!avRes.ok) throw new Error(`AV ${avRes.status}`)

    const data = await avRes.json()

    // AV rate limit — don't cache, let client retry later
    if (data['Note'] || data['Information']) {
      return res.status(429).json({ error: 'rate_limited' })
    }
    if (data['Error Message']) {
      // Invalid symbol — short cache so it doesn't block forever
      res.setHeader('Cache-Control', 's-maxage=300')
      return res.json({ ticker, rsi: null, bbPct: null })
    }

    const series = data['Time Series (Daily)']
    if (!series) throw new Error('no_data')

    // compact gives ~100 days; we only need 60 for RSI(14) + BB(20)
    const closes = Object.values(series)
      .slice(0, 60)
      .reverse()
      .map(bar => +bar['4. close'])

    // Cache 1 hour at Vercel edge; serve stale for up to 24 h while revalidating
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.json({ ticker, rsi: calcRSI(closes), bbPct: calcBBPct(closes) })
  } catch {
    res.setHeader('Cache-Control', 's-maxage=60')
    res.json({ ticker, rsi: null, bbPct: null })
  }
}
