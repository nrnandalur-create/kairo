import { rateLimit } from './_rateLimit.js'
import { validateTicker } from './_validate.js'

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
    avResult,
  ] = await Promise.all([
    Promise.all([
      fget('quote',   `${FINNHUB_BASE}/quote?symbol=${sym}&${t}`),
      fget('profile', `${FINNHUB_BASE}/stock/profile2?symbol=${sym}&${t}`),
      fget('metrics', `${FINNHUB_BASE}/stock/metric?symbol=${sym}&metric=all&${t}`),
      fget('news',    `${FINNHUB_BASE}/company-news?symbol=${sym}&from=${fmt(from)}&to=${fmt(now)}&${t}`)
        .catch(() => []),
    ]),
    fetchAVCandles(sym).catch(() => null),
  ])

  const synthetic = avResult === null
  const candles   = synthetic ? syntheticCandles(quote) : avResult
  const news      = Array.isArray(newsRaw) ? newsRaw.slice(0, 10) : []

  return { quote, profile, metrics, candles, synthetic, news }
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
  // ~12 months of daily bars, mapped to the Finnhub-compatible shape.
  const since = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60
  let candles = []
  try {
    const bars = await yahooFinance.historical(sym, {
      period1:  new Date(since * 1000),
      interval: '1d',
    })
    candles = bars.map(b => ({
      time:   Math.floor(b.date.getTime() / 1000),
      open:   b.open,
      high:   b.high,
      low:    b.low,
      close:  b.close,
      volume: b.volume,
    }))
  } catch {
    // Yahoo historical may fail for mutual funds etc — fall back to synthetic.
    candles = syntheticCandles(quote)
  }
  const synthetic = candles.length === 0
  if (synthetic) candles = syntheticCandles(quote)

  return {
    quote,
    profile,
    metrics,
    candles,
    synthetic,
    news: [],   // News fallback could call yahooFinance.search(sym).news in the future
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
