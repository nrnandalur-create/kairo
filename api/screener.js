import { rateLimit } from './_rateLimit.js'

const TICKERS = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'META', 'MSFT', 'GOOGL', 'AMD', 'INTC', 'NFLX']

const STATIC = {
  SPY:   { name: 'S&P 500 ETF',    cap: 'large' },
  QQQ:   { name: 'Nasdaq 100 ETF', cap: 'large' },
  AAPL:  { name: 'Apple',          cap: 'large' },
  MSFT:  { name: 'Microsoft',      cap: 'large' },
  NVDA:  { name: 'NVIDIA',         cap: 'large' },
  AMZN:  { name: 'Amazon',         cap: 'large' },
  META:  { name: 'Meta',           cap: 'large' },
  GOOGL: { name: 'Alphabet',       cap: 'large' },
  TSLA:  { name: 'Tesla',          cap: 'large' },
  NFLX:  { name: 'Netflix',        cap: 'large' },
  AMD:   { name: 'AMD',            cap: 'large' },
  INTC:  { name: 'Intel',          cap: 'mid'   },
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null
  const ch = closes.slice(1).map((c, i) => c - closes[i])
  let g = ch.slice(0, period).map(x => Math.max(x, 0)).reduce((a, b) => a + b, 0) / period
  let l = ch.slice(0, period).map(x => Math.max(-x, 0)).reduce((a, b) => a + b, 0) / period
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

async function fetchOne(symbol, apiKey) {
  const to   = Math.floor(Date.now() / 1000)
  const from = to - 100 * 86400
  try {
    const [qr, cr] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${apiKey}`),
    ])
    if (!qr.ok || !cr.ok) return null
    const [q, c] = await Promise.all([qr.json(), cr.json()])
    if (!q.c) return null
    const closes = c.s === 'ok' && Array.isArray(c.c) ? c.c : []
    return {
      symbol,
      name:      STATIC[symbol]?.name ?? symbol,
      cap:       STATIC[symbol]?.cap  ?? 'large',
      price:     q.c,
      change:    q.d,
      changePct: q.dp,
      rsi:       calcRSI(closes),
      bbPct:     calcBBPct(closes),
    }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Service unavailable' })
  const results = await Promise.all(TICKERS.map(t => fetchOne(t, apiKey)))
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  res.json({ stocks: results.filter(Boolean) })
}
