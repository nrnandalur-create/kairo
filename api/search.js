import { rateLimit } from './_rateLimit.js'
import { validateSearchQuery } from './_validate.js'

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

    const results = (data.result ?? [])
      .filter(item =>
        item.type === 'Common Stock' &&
        item.symbol &&
        !item.symbol.includes('.')
      )
      .slice(0, 6)
      .map(item => ({ symbol: item.displaySymbol || item.symbol, name: item.description }))

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.json({ results })
  } catch {
    res.json({ results: [] })
  }
}
