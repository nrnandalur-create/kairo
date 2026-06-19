import { rateLimit } from './_rateLimit.js'
import { validateTicker } from './_validate.js'

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const ticker = validateTicker(req.query.ticker)
  if (!ticker) return res.status(400).json({ error: 'invalid ticker' })

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'unavailable' })

  const now  = new Date()
  const from = new Date(now - 3 * 24 * 60 * 60 * 1000)
  const fmt  = d => d.toISOString().slice(0, 10)

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${fmt(from)}&to=${fmt(now)}&token=${apiKey}`
    )
    if (!r.ok) throw new Error(`Finnhub ${r.status}`)

    const raw = await r.json()
    if (!Array.isArray(raw)) throw new Error('unexpected response')

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600')
    res.json({
      ticker,
      articles: raw.slice(0, 15).map(a => ({
        headline: a.headline ?? '',
        datetime: a.datetime,
        source:   a.source,
        url:      a.url,
      })),
    })
  } catch {
    res.setHeader('Cache-Control', 's-maxage=60')
    res.json({ ticker, articles: [] })
  }
}
