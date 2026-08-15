import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '../lib/rateLimit.js'
import { validateTicker } from '../lib/validate.js'
import sp500 from '../src/data/sp500.json' with { type: 'json' }

const AV_BASE = 'https://www.alphavantage.co/query'

// ── Per-ticker RSI/BB indicators (was /api/screener-indicators) ────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null
  const ch = closes.slice(1).map((c, i) => c - closes[i])
  let g = ch.slice(0, period).reduce((a, b) => a + Math.max(b, 0), 0) / period
  let l = ch.slice(0, period).reduce((a, b) => a + Math.max(-b, 0), 0) / period
  for (let i = period; i < ch.length; i++) {
    g = (g * (period - 1) + Math.max(ch[i], 0)) / period
    l = (l * (period - 1) + Math.max(-ch[i], 0)) / period
  }
  // 2-decimal precision (was Math.round to integer — caused up to 0.5
  // drift from Finviz on the Screener cards).
  return l === 0 ? 100 : +(100 - 100 / (1 + g / l)).toFixed(2)
}

function calcBBPct(closes, period = 20) {
  if (closes.length < period) return null
  const sl   = closes.slice(-period)
  const mean = sl.reduce((a, b) => a + b, 0) / period
  const std  = Math.sqrt(sl.reduce((s, c) => s + (c - mean) ** 2, 0) / period)
  if (std === 0) return 50
  const upper = mean + 2 * std
  const lower = mean - 2 * std
  return Math.round(Math.max(0, Math.min(100, ((closes.at(-1) - lower) / (upper - lower)) * 100)))
}

async function handleIndicators(req, res) {
  const ticker = validateTicker(req.query.ticker)
  if (!ticker) return res.status(400).json({ error: 'invalid ticker' })

  const apiKey = process.env.ALPHA_VANTAGE_KEY
  if (!apiKey) return res.status(500).json({ error: 'unavailable' })

  try {
    const url   = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`
    const avRes = await fetch(url)
    if (!avRes.ok) throw new Error(`AV ${avRes.status}`)
    const data = await avRes.json()
    if (data['Note'] || data['Information']) return res.status(429).json({ error: 'rate_limited' })
    if (data['Error Message']) {
      res.setHeader('Cache-Control', 's-maxage=300')
      return res.json({ ticker, rsi: null, bbPct: null })
    }
    const series = data['Time Series (Daily)']
    if (!series) throw new Error('no_data')
    const closes = Object.values(series).slice(0, 60).reverse().map(bar => +bar['4. close'])
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.json({ ticker, rsi: calcRSI(closes), bbPct: calcBBPct(closes) })
  } catch {
    res.setHeader('Cache-Control', 's-maxage=60')
    res.json({ ticker, rsi: null, bbPct: null })
  }
}

const TICKERS = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'META', 'MSFT', 'GOOGL', 'AMD', 'INTC', 'NFLX']

const STATIC = {
  SPY:   { name: 'S&P 500 ETF',    cap: 'large' },
  QQQ:   { name: 'Nasdaq 100 ETF', cap: 'large' },
  AAPL:  { name: 'Apple',          cap: 'large' },
  MSFT:  { name: 'Microsoft',      cap: 'large' },
  NVDA:  { name: 'NVIDIA',         cap: 'large' },
  AMZN:  { name: 'Amazon',         cap: 'large' },
  META:  { name: 'Meta',           cap: 'large' },
  GOOGL: { name: 'Alphabet',       cap: 'large' },
  TSLA:  { name: 'Tesla',          cap: 'large' },
  NFLX:  { name: 'Netflix',        cap: 'large' },
  AMD:   { name: 'AMD',            cap: 'large' },
  INTC:  { name: 'Intel',          cap: 'mid'   },
}

async function fetchOne(symbol, apiKey) {
  try {
    const qr = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`)
    if (!qr.ok) return null
    const q = await qr.json()
    if (!q?.c) return null
    return {
      symbol,
      name:      STATIC[symbol]?.name ?? symbol,
      cap:       STATIC[symbol]?.cap  ?? 'large',
      price:     q.c,
      change:    q.d,
      changePct: q.dp,
    }
  } catch {
    return null
  }
}

// ── S&P 500 RSI Scan (was a standalone api/scan.js — folded in here to stay
// under Vercel Hobby's 12-function cap). Chunked start/tick job queue so a
// full ~503-ticker sweep never has to fit inside one invocation. ───────────
const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SCAN_BATCH_SIZE  = 25

// Same instantiation fix + chart()/historical() fallback as api/market.js's
// fetchYahooCandles, extended with a concurrency-capped batch wrapper. Kept
// local rather than importing from market.js so batch behavior can't
// regress the single-ticker analysis path.
let _yahoo = null
async function getYahoo() {
  if (_yahoo) return _yahoo
  const { default: YahooFinance } = await import('yahoo-finance2')
  _yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })
  return _yahoo
}

async function fetchYahooCloses(sym) {
  try {
    const yf = await getYahoo()
    const since = new Date(Date.now() - 365 * 86_400_000)
    let bars = null
    if (typeof yf.chart === 'function') {
      try {
        const r = await yf.chart(sym, { period1: since, interval: '1d' })
        bars = r?.quotes ?? null
      } catch { /* try legacy */ }
    }
    if (!bars && typeof yf.historical === 'function') {
      bars = await yf.historical(sym, { period1: since, interval: '1d' })
    }
    if (!Array.isArray(bars) || !bars.length) return null
    return bars.filter(b => b && b.date && b.close != null).map(b => b.close)
  } catch {
    return null
  }
}

async function fetchClosesBatch(tickers, concurrency = 5) {
  const out = []
  for (let i = 0; i < tickers.length; i += concurrency) {
    const chunk = tickers.slice(i, i + concurrency)
    const results = await Promise.all(
      chunk.map(async ticker => ({ ticker, closes: await fetchYahooCloses(ticker.replace(/\./g, '-')) }))
    )
    out.push(...results)
  }
  return out
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function handleScanStart(req, res, supabase) {
  const force = Boolean(req.body?.force)
  const scanDate = today()

  if (!force) {
    const { data: existing } = await supabase
      .from('scan_jobs')
      .select('id, status')
      .eq('scan_date', scanDate)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing && (existing.status === 'done' || existing.status === 'running')) {
      res.status(200).json({ jobId: existing.id, status: existing.status })
      return
    }
  }

  const { data: job, error } = await supabase
    .from('scan_jobs')
    .insert({ scan_date: scanDate, status: 'running', total: sp500.length, cursor: 0 })
    .select()
    .single()
  if (error) { res.status(500).json({ error: `Failed to create scan job: ${error.message}` }); return }

  res.status(200).json({ jobId: job.id, status: 'running' })
}

async function handleScanTick(req, res, supabase) {
  const jobId = req.body?.jobId
  if (!jobId) { res.status(400).json({ error: 'jobId required' }); return }

  const { data: job, error: jobErr } = await supabase.from('scan_jobs').select('*').eq('id', jobId).single()
  if (jobErr || !job) { res.status(404).json({ error: 'Job not found' }); return }

  if (job.status === 'done') {
    res.status(200).json({ status: 'done', processed: job.processed, total: job.total, failedCount: job.failed_count })
    return
  }

  const batch = sp500.slice(job.cursor, job.cursor + SCAN_BATCH_SIZE)
  const fetched = await fetchClosesBatch(batch.map(s => s.ticker), 5)
  const byTicker = Object.fromEntries(fetched.map(f => [f.ticker, f.closes]))

  let batchFailed = 0
  const rows = []
  for (const stock of batch) {
    const closes = byTicker[stock.ticker]
    const rsi = closes ? calcRSI(closes) : null
    if (rsi == null) { batchFailed++; continue }
    rows.push({
      job_id: job.id,
      scan_date: job.scan_date,
      ticker: stock.ticker,
      company_name: stock.name,
      sector: stock.sector,
      price: closes[closes.length - 1],
      rsi,
    })
  }

  if (rows.length) {
    const { error: upsertErr } = await supabase.from('scan_results').upsert(rows, { onConflict: 'scan_date,ticker' })
    if (upsertErr) { res.status(500).json({ error: `Failed to store batch: ${upsertErr.message}` }); return }
  }

  const newCursor = job.cursor + batch.length
  const newProcessed = job.processed + rows.length
  const newFailed = job.failed_count + batchFailed
  const done = newCursor >= sp500.length

  await supabase
    .from('scan_jobs')
    .update({
      cursor: newCursor,
      processed: newProcessed,
      failed_count: newFailed,
      status: done ? 'done' : 'running',
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq('id', job.id)

  res.status(200).json({ status: done ? 'done' : 'running', processed: newProcessed, total: sp500.length, failedCount: newFailed })
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return

  // Indicators short-path (was /api/screener-indicators)
  if (req.method === 'GET' && req.query?.type === 'indicators') return handleIndicators(req, res)

  // S&P 500 RSI scan job queue
  if (req.query?.type === 'scan-start' || req.query?.type === 'scan-tick') {
    if (req.method !== 'POST') return res.status(405).end()
    if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
    if (req.query.type === 'scan-start') return handleScanStart(req, res, supabase)
    return handleScanTick(req, res, supabase)
  }

  if (req.method !== 'GET') return res.status(405).end()

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Service unavailable' })
  const results = await Promise.all(TICKERS.map(t => fetchOne(t, apiKey)))
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  res.json({ stocks: results.filter(Boolean) })
}
