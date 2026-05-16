import { rateLimit } from './_rateLimit.js'

const INDICES = ['SPY', 'QQQ', 'DIA']
const MOVERS  = ['AAPL', 'TSLA', 'NVDA', 'AMZN', 'META', 'MSFT', 'GOOGL', 'AMD', 'INTC', 'NFLX']

async function fetchQuote(symbol, apiKey) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`)
    if (!r.ok) return { symbol, price: null, change: null, changePct: null }
    const d = await r.json()
    return { symbol, price: d.c ?? null, change: d.d ?? null, changePct: d.dp ?? null }
  } catch {
    return { symbol, price: null, change: null, changePct: null }
  }
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Service unavailable' })

  const all     = [...INDICES, ...MOVERS]
  const results = await Promise.all(all.map(s => fetchQuote(s, apiKey)))

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
  res.json({
    indices: results.slice(0, INDICES.length),
    movers:  results.slice(INDICES.length),
  })
}
