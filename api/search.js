import { rateLimit } from '../lib/rateLimit.js'
import { validateSearchQuery } from '../lib/validate.js'

// Same ticker shape as lib/validate.js — inline here so we can filter
// autocomplete rows to symbols the downstream /api/market endpoint will
// actually accept. Allows the dot-suffix class-share notation (BRK.B).
const AUTOCOMPLETE_TICKER_RE = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Service unavailable' })

  const q = validateSearchQuery(req.query.q)
  if (!q) return res.json({ results: [] })

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${apiKey}`
    )
    if (!r.ok) return res.json({ results: [] })
    const data = await r.json()

    // Prefer Finnhub's `displaySymbol` — it's the user-facing form (BRK.B)
    // rather than the internal wire form (BRK-B). Keep only symbols whose
    // final shape passes the ticker regex the market endpoint enforces,
    // otherwise the user could pick a suggestion the app then rejects.
    const results = (data.result ?? [])
      .filter(item => item.type === 'Common Stock' && item.symbol)
      .map(item => ({
        symbol: (item.displaySymbol || item.symbol).toUpperCase(),
        name:   item.description,
      }))
      .filter(item => AUTOCOMPLETE_TICKER_RE.test(item.symbol))
      .slice(0, 6)

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.json({ results })
  } catch {
    res.json({ results: [] })
  }
}
