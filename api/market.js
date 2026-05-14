const BASE = 'https://finnhub.io/api/v1'

async function fget(path) {
  const url = `${BASE}${path}&token=${process.env.FINNHUB_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`)
  return res.json()
}

function formatCandles(raw) {
  if (!raw || raw.s !== 'ok') return []
  return raw.t.map((ts, i) => ({
    time: ts,
    open: raw.o[i],
    high: raw.h[i],
    low: raw.l[i],
    close: raw.c[i],
    volume: raw.v[i],
  }))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'Missing ticker query param' })

  const sym = ticker.toUpperCase()
  const to = Math.floor(Date.now() / 1000)
  const from = to - 45 * 24 * 60 * 60

  const [quote, profile, metrics, rawCandles] = await Promise.all([
    fget(`/quote?symbol=${sym}`),
    fget(`/stock/profile2?symbol=${sym}`),
    fget(`/stock/metric?symbol=${sym}&metric=all`),
    fget(`/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}`),
  ])

  res.json({ quote, profile, metrics, candles: formatCandles(rawCandles) })
}
