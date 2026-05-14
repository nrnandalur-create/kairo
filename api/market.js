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

// Deterministic xorshift32 seeded from the previous close so the chart
// looks stable across refreshes for the same price snapshot.
function makeRng(seed) {
  let s = (Math.abs(Math.round(seed * 137)) || 0x9e3779b9) >>> 0
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

// Build 30 synthetic daily candles anchored to the live quote.
// The last candle uses real intraday OHLC; the preceding 29 are a
// seeded random walk backwards from pc so the series is internally
// consistent without requiring a paid candle endpoint.
function syntheticCandles(quote) {
  const DAYS = 30
  const DAY  = 86400
  const todayMidnight = Math.floor(Date.now() / 1000)
  const rand = makeRng(quote.pc)

  // Clamp daily vol between 0.5 % and 4 %
  const vol = Math.min(Math.max(Math.abs(quote.dp ?? 1.5) / 100, 0.005), 0.04)

  // Generate (DAYS - 1) synthetic closes, walking backwards from pc
  const closes = new Array(DAYS - 1)
  closes[DAYS - 2] = quote.pc
  for (let i = DAYS - 3; i >= 0; i--) {
    const drift = (rand() - 0.48) * 2 * vol * closes[i + 1]
    closes[i] = Math.max(closes[i + 1] + drift, 0.01)
  }

  const fix = (n) => +Math.max(n, 0.01).toFixed(2)

  const candles = closes.map((close, i) => {
    const open     = i === 0 ? fix(close * (1 + (rand() - 0.5) * vol)) : closes[i - 1]
    const bodySpan = Math.abs(close - open) + close * vol * 0.4 * rand()
    const high     = fix(Math.max(open, close) + bodySpan * (0.3 + rand() * 0.5))
    const low      = fix(Math.min(open, close) - bodySpan * (0.3 + rand() * 0.5))
    return {
      time:   todayMidnight - (DAYS - 1 - i) * DAY,
      open:   fix(open),
      high,
      low,
      close:  fix(close),
      volume: Math.round(3e6 + rand() * 20e6),
    }
  })

  // Append real intraday candle for today
  candles.push({
    time:   todayMidnight,
    open:   fix(quote.o  ?? quote.pc),
    high:   fix(quote.h  ?? quote.c),
    low:    fix(quote.l  ?? quote.c),
    close:  fix(quote.c),
    volume: Math.round(5e6 + rand() * 15e6),
  })

  return candles
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
    const t   = `token=${key}`

    const [quote, profile, metrics] = await Promise.all([
      fget('quote',   `${BASE}/quote?symbol=${sym}&${t}`),
      fget('profile', `${BASE}/stock/profile2?symbol=${sym}&${t}`),
      fget('metrics', `${BASE}/stock/metric?symbol=${sym}&metric=all&${t}`),
    ])

    const candles = syntheticCandles(quote)
    console.log(`[market] success for ${sym} — ${candles.length} synthetic candles`)

    res.json({ quote, profile, metrics, candles, synthetic: true })
  } catch (err) {
    console.error('[market] error:', err.message)
    const status = err.message.includes('401') ? 401 : err.message.includes('403') ? 403 : 500
    res.status(status).json({ error: err.message })
  }
}
