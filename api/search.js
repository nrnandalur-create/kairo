export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Missing FINNHUB_API_KEY' })

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q.length < 1) return res.json({ results: [] })

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
        !item.symbol.includes('.')   // drop non-US exchange variants like AAPL.MX
      )
      .slice(0, 6)
      .map(item => ({ symbol: item.displaySymbol || item.symbol, name: item.description }))

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.json({ results })
  } catch {
    res.json({ results: [] })
  }
}
