import { rateLimit } from '../lib/rateLimit.js'
import { validateSymbolList } from '../lib/validate.js'

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

  const symbols = validateSymbolList(req.query.symbols ?? '')
  if (!symbols) return res.status(400).json({ error: 'Invalid symbols. Provide 1-20 valid ticker symbols.' })

  const quotes = await Promise.all(symbols.map(s => fetchQuote(s, apiKey)))

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
  res.json({ quotes })
}
