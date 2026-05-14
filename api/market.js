const BASE = 'https://finnhub.io/api/v1'

async function fget(label, url) {
  console.log(`[market] fetching ${label}: ${url.replace(/token=[^&]+/, 'token=***')}`)
  const res = await fetch(url)
  console.log(`[market] ${label} → HTTP ${res.status}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Finnhub ${res.status} on ${label}: ${body.slice(0, 200)}`)
  }
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

  const key = process.env.FINNHUB_API_KEY
  const keyStatus = key ? `set (${key.slice(0, 4)}…${key.slice(-4)})` : 'MISSING'
  console.log(`[market] ticker=${ticker.toUpperCase()} FINNHUB_API_KEY=${keyStatus}`)

  if (!key) {
    return res.status(500).json({ error: 'FINNHUB_API_KEY environment variable is not set' })
  }

  try {
    const sym = ticker.toUpperCase()
    const to = Math.floor(Date.now() / 1000)
    const from = to - 45 * 24 * 60 * 60
    const t = `token=${key}`

    const [quote, profile, metrics, rawCandles] = await Promise.all([
      fget('quote',   `${BASE}/quote?symbol=${sym}&${t}`),
      fget('profile', `${BASE}/stock/profile2?symbol=${sym}&${t}`),
      fget('metrics', `${BASE}/stock/metric?symbol=${sym}&metric=all&${t}`),
      fget('candles', `${BASE}/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&${t}`),
    ])

    console.log(`[market] all requests succeeded for ${sym}`)
    res.json({ quote, profile, metrics, candles: formatCandles(rawCandles) })
  } catch (err) {
    console.error('[market] error:', err.message)
    const status = err.message.includes('401') ? 401 : err.message.includes('403') ? 403 : 500
    res.status(status).json({ error: err.message })
  }
}
