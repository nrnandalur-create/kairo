const FINNHUB_BASE = 'https://finnhub.io/api/v1'
const AV_BASE      = 'https://www.alphavantage.co/query'

// ── Finnhub helper ──────────────────────────────────────────────────────────

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

// ── Alpha Vantage candles ───────────────────────────────────────────────────

async function fetchAVCandles(sym) {
  const avKey = process.env.ALPHA_VANTAGE_KEY
  const avKeyStatus = avKey ? `set (${avKey.slice(0, 4)}…${avKey.slice(-4)})` : 'MISSING'
  console.log(`[market] ALPHA_VANTAGE_KEY=${avKeyStatus}`)

  if (!avKey) throw new Error('ALPHA_VANTAGE_KEY environment variable is not set')

  const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${sym}&outputsize=full&apikey=${avKey}`
  console.log(`[market] fetching AV candles: ${url.replace(/apikey=[^&]+/, 'apikey=***')}`)

  const res = await fetch(url)
  console.log(`[market] AV candles → HTTP ${res.status}`)
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`)

  const data = await res.json()

  // Alpha Vantage signals all errors via JSON on HTTP 200
  if (data['Error Message']) throw new Error(`Alpha Vantage symbol error: ${data['Error Message']}`)
  if (data['Note'])         throw new Error(`Alpha Vantage rate limit: ${data['Note'].slice(0, 120)}`)
  if (data['Information'])  throw new Error(`Alpha Vantage key error: ${data['Information'].slice(0, 120)}`)

  const series = data['Time Series (Daily)']
  if (!series) throw new Error('Alpha Vantage: missing "Time Series (Daily)" in response')

  // Entries are newest-first; take 250 (~1 year of trading days) for SMA 200 support
  const candles = Object.entries(series)
    .slice(0, 250)
    .reverse()
    .map(([date, bar]) => {
      const [y, m, d] = date.split('-').map(Number)
      return {
        time:   Date.UTC(y, m - 1, d) / 1000,
        open:   +bar['1. open'],
        high:   +bar['2. high'],
        low:    +bar['3. low'],
        close:  +bar['4. close'],
        volume: +bar['5. volume'],
      }
    })

  console.log(`[market] AV returned ${candles.length} candles for ${sym}`)
  return candles
}

// ── Synthetic fallback (seeded random walk from live quote) ─────────────────
// Used when Alpha Vantage is unavailable (rate limit, missing key, etc.)

function makeRng(seed) {
  let s = (Math.abs(Math.round(seed * 137)) || 0x9e3779b9) >>> 0
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0x100000000 }
}

function syntheticCandles(quote) {
  const DAYS = 30
  const DAY  = 86400
  const todayMidnight = Math.floor(Date.now() / 1000)
  const rand = makeRng(quote.pc)
  const vol  = Math.min(Math.max(Math.abs(quote.dp ?? 1.5) / 100, 0.005), 0.04)
  const fix  = (n) => +Math.max(n, 0.01).toFixed(2)

  const closes = new Array(DAYS - 1)
  closes[DAYS - 2] = quote.pc
  for (let i = DAYS - 3; i >= 0; i--) {
    closes[i] = Math.max(closes[i + 1] + (rand() - 0.48) * 2 * vol * closes[i + 1], 0.01)
  }

  const candles = closes.map((close, i) => {
    const open     = i === 0 ? fix(close * (1 + (rand() - 0.5) * vol)) : closes[i - 1]
    const bodySpan = Math.abs(close - open) + close * vol * 0.4 * rand()
    return {
      time:   todayMidnight - (DAYS - 1 - i) * DAY,
      open:   fix(open),
      high:   fix(Math.max(open, close) + bodySpan * (0.3 + rand() * 0.5)),
      low:    fix(Math.min(open, close) - bodySpan * (0.3 + rand() * 0.5)),
      close:  fix(close),
      volume: Math.round(3e6 + rand() * 20e6),
    }
  })

  candles.push({
    time:   todayMidnight,
    open:   fix(quote.o ?? quote.pc),
    high:   fix(quote.h ?? quote.c),
    low:    fix(quote.l ?? quote.c),
    close:  fix(quote.c),
    volume: Math.round(5e6 + rand() * 15e6),
  })

  return candles
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'Missing ticker query param' })

  const finnhubKey = process.env.FINNHUB_API_KEY
  console.log(`[market] ticker=${ticker.toUpperCase()} FINNHUB_API_KEY=${finnhubKey ? `set (${finnhubKey.slice(0, 4)}…${finnhubKey.slice(-4)})` : 'MISSING'}`)
  if (!finnhubKey) return res.status(500).json({ error: 'FINNHUB_API_KEY environment variable is not set' })

  try {
    const sym = ticker.toUpperCase()
    const t   = `token=${finnhubKey}`

    const now  = new Date()
    const from = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const fmt  = d => d.toISOString().slice(0, 10)

    // Finnhub (quote/profile/metrics/news) and Alpha Vantage (candles) in parallel
    const [
      [quote, profile, metrics, newsRaw],
      avResult,
    ] = await Promise.all([
      Promise.all([
        fget('quote',   `${FINNHUB_BASE}/quote?symbol=${sym}&${t}`),
        fget('profile', `${FINNHUB_BASE}/stock/profile2?symbol=${sym}&${t}`),
        fget('metrics', `${FINNHUB_BASE}/stock/metric?symbol=${sym}&metric=all&${t}`),
        fget('news',    `${FINNHUB_BASE}/company-news?symbol=${sym}&from=${fmt(from)}&to=${fmt(now)}&${t}`)
          .catch(err => { console.warn(`[market] news fetch failed: ${err.message}`); return [] }),
      ]),
      fetchAVCandles(sym).catch(err => {
        console.warn(`[market] Alpha Vantage failed, using synthetic fallback: ${err.message}`)
        return null
      }),
    ])

    const synthetic = avResult === null
    const candles   = synthetic ? syntheticCandles(quote) : avResult
    const news      = Array.isArray(newsRaw) ? newsRaw.slice(0, 10) : []

    console.log(`[market] success for ${sym} — ${candles.length} candles (${synthetic ? 'synthetic' : 'Alpha Vantage'}), ${news.length} news items`)
    res.json({ quote, profile, metrics, candles, synthetic, news })
  } catch (err) {
    console.error('[market] error:', err.message)
    const status = err.message.includes('401') ? 401 : err.message.includes('403') ? 403 : 500
    res.status(status).json({ error: err.message })
  }
}
