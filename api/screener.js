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

async function fetchOne(symbol, apiKey) {
  try {
    const qr = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`)
    if (!qr.ok) return null
    const q = await qr.json()
    if (!q?.c) return null
    return {
      symbol,
      name:      STATIC[symbol]?.name ?? symbol,
      cap:       STATIC[symbol]?.cap  ?? 'large',
      price:     q.c,
      change:    q.d,
      changePct: q.dp,
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
