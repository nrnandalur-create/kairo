import { rateLimit } from '../lib/rateLimit.js'
import { validateTicker } from '../lib/validate.js'

// yahoo-finance2 is heavy (~3MB with deps). Lazy-load it so the happy path
// (Finnhub responds successfully) doesn't pay the cold-start cost. Only the
// rare fallback path pays for module init.
let _yahoo = null
async function getYahoo() {
  if (_yahoo) return _yahoo
  const { default: yahooFinance } = await import('yahoo-finance2')
  yahooFinance.suppressNotices(['ripHistorical', 'yahooSurvey'])
  _yahoo = yahooFinance
  return yahooFinance
}

const FINNHUB_BASE = 'https://finnhub.io/api/v1'
const AV_BASE      = 'https://www.alphavantage.co/query'

async function fget(label, url) {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Finnhub ${res.status} on ${label}: ${body.slice(0, 120)}`)
  }
  return res.json()
}

async function fetchAVCandles(sym) {
  const avKey = process.env.ALPHA_VANTAGE_KEY
  if (!avKey) throw new Error('ALPHA_VANTAGE_KEY is not set')

  const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${sym}&outputsize=full&apikey=${avKey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`)

  const data = await res.json()

  if (data['Error Message']) throw new Error(`Alpha Vantage symbol error`)
  if (data['Note'])          throw new Error(`Alpha Vantage rate limit`)
  if (data['Information'])   throw new Error(`Alpha Vantage key error`)

  const series = data['Time Series (Daily)']
  if (!series) throw new Error('Alpha Vantage: missing time series data')

  return Object.entries(series)
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
}

// Fallback #2 — Finnhub's own /stock/candle endpoint. Same API key as the
// quote/profile/metrics calls; the free tier covers daily candles. Used when
// Alpha Vantage rate-limits (25 calls/day on the free tier is the usual
// reason). Returns the same { time, open, high, low, close, volume } shape.
async function fetchFinnhubCandles(sym) {
  const finnhubKey = process.env.FINNHUB_API_KEY
  if (!finnhubKey) throw new Error('FINNHUB_API_KEY not set')

  const to   = Math.floor(Date.now() / 1000)
  const from = to - 365 * 24 * 60 * 60   // ~12 months of daily bars
  const url  = `${FINNHUB_BASE}/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${finnhubKey}`
  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub candles HTTP ${res.status}`)

  const data = await res.json()
  if (data.s !== 'ok' || !Array.isArray(data.t) || !data.t.length) {
    throw new Error(`Finnhub candles: no data (${data.s ?? 'unknown'})`)
  }
  return data.t.map((time, i) => ({
    time,
    open:   data.o[i],
    high:   data.h[i],
    low:    data.l[i],
    close:  data.c[i],
    volume: data.v[i],
  }))
}

// Fallback #3 — Yahoo's historical daily bars. Reuses the lazy-loaded
// yahoo-finance2 module that the Yahoo quote fallback already imports.
// Yahoo covers symbols Finnhub doesn't recognize (foreign listings,
// older delisted tickers, some ETFs).
async function fetchYahooCandles(sym) {
  const yf = await getYahoo()
  const since = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60
  const bars = await yf.historical(sym, {
    period1:  new Date(since * 1000),
    interval: '1d',
  })
  if (!Array.isArray(bars) || !bars.length) {
    throw new Error('Yahoo historical: no bars')
  }
  return bars.map(b => ({
    time:   Math.floor(b.date.getTime() / 1000),
    open:   b.open,
    high:   b.high,
    low:    b.low,
    close:  b.close,
    volume: b.volume,
  }))
}

// Optional fallback — Polygon.io. Used only when POLYGON_API_KEY is set.
// Polygon's free tier (5 calls/min, 2yr history) is the most reliable of
// the freemium options. Format is similar to Finnhub's candle endpoint.
async function fetchPolygonCandles(sym) {
  const key = process.env.POLYGON_API_KEY
  if (!key) throw new Error('POLYGON_API_KEY not set')
  const to   = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
  const url  = `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=500&apiKey=${key}`
  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Polygon HTTP ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data.results) || !data.results.length) {
    throw new Error(`Polygon: no results (${data.status})`)
  }
  return data.results.map(b => ({
    time:   Math.floor(b.t / 1000),
    open:   b.o,
    high:   b.h,
    low:    b.l,
    close:  b.c,
    volume: b.v,
  }))
}

// A source is rejected if its most recent candle is older than this many
// calendar days. AV's free tier silently returns data that lags by a week
// or more — without this check we'd trust stale data and compute RSI on
// it. Weekends are accounted for: 4 days covers Fri → Mon, plus a holiday.
const STALE_THRESHOLD_DAYS = 4
function isFresh(candles) {
  if (!candles?.length) return false
  const lastTime = candles[candles.length - 1].time
  const ageDays = (Date.now() / 1000 - lastTime) / 86_400
  return ageDays <= STALE_THRESHOLD_DAYS
}

// Source priority (most reliable for FREE first):
//   1. Yahoo Finance — most reliable free OHLC, freshest, no per-day caps
//   2. Polygon.io   — only if POLYGON_API_KEY set; better than AV when present
//   3. Finnhub /stock/candle — works if user is on paid Finnhub tier
//   4. Alpha Vantage — last resort; free tier silently returns stale data
//
// At every step we also check freshness — even if a source returns bars,
// if the latest one is older than ~4 days we treat the source as failed
// and move on. This protects against AV's "responded but with stale data"
// failure mode that previously poisoned RSI/MACD without any error path.
async function fetchRealCandles(sym) {
  const errors = []
  const trySource = async (label, fn) => {
    try {
      const c = await fn()
      if (!isFresh(c)) {
        const lastTime = c?.[c.length - 1]?.time
        const ageDays = lastTime ? Math.round((Date.now() / 1000 - lastTime) / 86_400) : '?'
        errors.push(`${label}: stale (${ageDays}d old)`)
        return null
      }
      return c
    } catch (e) {
      errors.push(`${label}: ${e.message}`)
      return null
    }
  }

  const yh = await trySource('Yahoo', () => fetchYahooCandles(sym))
  if (yh) return { candles: yh, source: 'yahoo' }

  const pg = await trySource('Polygon', () => fetchPolygonCandles(sym))
  if (pg) return { candles: pg, source: 'polygon' }

  const fh = await trySource('Finnhub', () => fetchFinnhubCandles(sym))
  if (fh) return { candles: fh, source: 'finnhub' }

  const av = await trySource('AV', () => fetchAVCandles(sym))
  if (av) return { candles: av, source: 'alphavantage' }

  return { candles: null, source: null, reason: errors.join(' · ') }
}

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

// ── Finnhub primary path ─────────────────────────────────────────────────────
async function fetchFinnhubMarket(sym) {
  const finnhubKey = process.env.FINNHUB_API_KEY
  if (!finnhubKey) throw new Error('FINNHUB_API_KEY not set')

  const t   = `token=${finnhubKey}`
  const now = new Date()
  const from = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const fmt  = d => d.toISOString().slice(0, 10)

  const [
    [quote, profile, metrics, newsRaw],
    realResult,
  ] = await Promise.all([
    Promise.all([
      fget('quote',   `${FINNHUB_BASE}/quote?symbol=${sym}&${t}`),
      fget('profile', `${FINNHUB_BASE}/stock/profile2?symbol=${sym}&${t}`),
      fget('metrics', `${FINNHUB_BASE}/stock/metric?symbol=${sym}&metric=all&${t}`),
      fget('news',    `${FINNHUB_BASE}/company-news?symbol=${sym}&from=${fmt(from)}&to=${fmt(now)}&${t}`)
        .catch(() => []),
    ]),
    fetchRealCandles(sym),
  ])

  const synthetic       = !realResult.candles
  const candles         = synthetic ? syntheticCandles(quote) : realResult.candles
  const candlesSource   = realResult.source
  const syntheticReason = synthetic ? realResult.reason : null
  const news            = Array.isArray(newsRaw) ? newsRaw.slice(0, 10) : []

  return { quote, profile, metrics, candles, candlesSource, synthetic, syntheticReason, news }
}

// ── Yahoo Finance fallback ──────────────────────────────────────────────────
// Used when Finnhub doesn't recognize the symbol (foreign listings, mutual
// funds, less-common ETFs, etc.). Maps Yahoo's response into the same shape
// the rest of the app expects from Finnhub.
async function fetchYahooMarket(sym) {
  const yahooFinance = await getYahoo()
  // One call returns a rich superset of what Finnhub gives across three calls.
  const [quoteRaw, summary] = await Promise.all([
    yahooFinance.quote(sym),
    yahooFinance.quoteSummary(sym, {
      modules: ['summaryDetail', 'price', 'defaultKeyStatistics', 'assetProfile', 'financialData'],
    }).catch(() => ({})),
  ])

  if (!quoteRaw || quoteRaw.regularMarketPrice == null) {
    throw new Error('Symbol not found on Yahoo')
  }

  // ── Quote (Finnhub-compatible) ─────────────────────────────────────────────
  const quote = {
    c:  quoteRaw.regularMarketPrice,
    d:  quoteRaw.regularMarketChange,
    dp: quoteRaw.regularMarketChangePercent,
    h:  quoteRaw.regularMarketDayHigh,
    l:  quoteRaw.regularMarketDayLow,
    o:  quoteRaw.regularMarketOpen,
    pc: quoteRaw.regularMarketPreviousClose,
    t:  Math.floor((quoteRaw.regularMarketTime ?? Date.now()) / 1000),
  }

  // ── Profile (Finnhub-compatible) ───────────────────────────────────────────
  // Yahoo gives marketCap in raw dollars; Finnhub uses millions — convert.
  const priceMod   = summary?.price ?? {}
  const profileMod = summary?.assetProfile ?? {}
  const mcRaw      = quoteRaw.marketCap ?? priceMod.marketCap
  const profile    = {
    ticker:               sym,
    name:                 priceMod.longName ?? priceMod.shortName ?? quoteRaw.longName ?? quoteRaw.shortName ?? sym,
    exchange:             quoteRaw.fullExchangeName ?? priceMod.exchangeName ?? quoteRaw.exchange ?? '',
    currency:             quoteRaw.currency ?? priceMod.currency ?? 'USD',
    country:              profileMod.country ?? '',
    finnhubIndustry:      profileMod.industry ?? profileMod.sector ?? '',
    weburl:               profileMod.website ?? '',
    marketCapitalization: mcRaw ? mcRaw / 1_000_000 : null,
    shareOutstanding:     quoteRaw.sharesOutstanding ? quoteRaw.sharesOutstanding / 1_000_000 : null,
  }

  // ── Metrics (Finnhub-compatible — only fields we actually surface) ─────────
  const detail = summary?.summaryDetail        ?? {}
  const stats  = summary?.defaultKeyStatistics ?? {}
  const fin    = summary?.financialData        ?? {}

  // Yahoo returns dividendYield as a decimal (0.0042 for 0.42%); Finnhub uses
  // a percentage (0.42). Normalize to Finnhub's convention.
  const divYieldPct = (detail.dividendYield ?? detail.trailingAnnualDividendYield)
    ? (detail.dividendYield ?? detail.trailingAnnualDividendYield) * 100
    : null

  const metrics = {
    metric: {
      '52WeekHigh':                detail.fiftyTwoWeekHigh    ?? null,
      '52WeekLow':                 detail.fiftyTwoWeekLow     ?? null,
      beta:                        detail.beta ?? stats.beta  ?? null,
      peBasicExclExtraTTM:         detail.trailingPE          ?? null,
      peTTM:                       detail.trailingPE          ?? null,
      peNormalizedAnnual:          stats.forwardPE            ?? null,
      epsGrowth5Y:                 stats.earningsGrowth ? stats.earningsGrowth * 100 : null,
      dividendYieldIndicatedAnnual: divYieldPct,
      psTTM:                       detail.priceToSalesTrailing12Months ?? null,
    },
  }

  // ── Candles ────────────────────────────────────────────────────────────────
  // Same three-source priority as the Finnhub primary path: AV → Finnhub →
  // Yahoo. Yahoo will usually succeed here (we already landed on this branch
  // because the symbol came back through Yahoo's quote endpoint) but we still
  // try AV first for parity. Falls to synthetic ONLY if all three error.
  const real            = await fetchRealCandles(sym)
  const synthetic       = !real.candles
  const candles         = synthetic ? syntheticCandles(quote) : real.candles
  const candlesSource   = real.source
  const syntheticReason = synthetic ? real.reason : null

  return {
    quote,
    profile,
    metrics,
    candles,
    candlesSource,
    synthetic,
    syntheticReason,
    news: [],   // News fallback could call yahooFinance.search(sym).news in the future
  }
}

// ── News short-path (was the standalone /api/news endpoint) ─────────────────
// Trips when ?fields=news is set on a GET. Returns only ticker headlines —
// no quote/profile/metrics/candles fetches. Used by WatchlistSentiment to
// score a watchlist row without paying for the full market pipeline per ticker.
async function handleNewsOnly(ticker, res) {
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
    return res.json({
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
    return res.json({ ticker, articles: [] })
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(req, res)) return

  const ticker = validateTicker(req.query.ticker)
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker. Must be 1-5 uppercase letters.' })

  // News-only short-path — was the standalone /api/news endpoint before
  // consolidation. Kept cheap (one Finnhub call) for batched watchlist use.
  if (req.query.fields === 'news') return handleNewsOnly(ticker, res)

  // Try Finnhub first; if it returns no quote, fall back to Yahoo.
  let finnhubData = null
  let finnhubErr  = null
  try {
    finnhubData = await fetchFinnhubMarket(ticker)
  } catch (err) {
    finnhubErr = err
  }

  if (finnhubData?.quote?.c != null) {
    return res.json({ ...finnhubData, source: 'finnhub' })
  }

  // Auth errors short-circuit the fallback — the user needs to see the real
  // problem, not a generic "ticker not found" message.
  if (finnhubErr?.message?.includes('401') || finnhubErr?.message?.includes('403')) {
    return res.status(401).json({ error: 'Invalid Finnhub API key. Check your FINNHUB_API_KEY configuration.' })
  }

  // Finnhub didn't recognize the ticker (or had a non-auth error) — fall
  // back to Yahoo. Time-box the fallback so a slow Yahoo doesn't drag the
  // whole response past the function's timeout.
  try {
    const yahooData = await Promise.race([
      fetchYahooMarket(ticker),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Yahoo timeout')), 6000)),
    ])
    return res.json({ ...yahooData, source: 'yahoo' })
  } catch {
    return res.status(404).json({ error: `No data found for "${ticker}". Check the symbol and try again.` })
  }
}
