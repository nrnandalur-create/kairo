import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '../lib/rateLimit.js'
import sp500 from '../src/data/sp500.json' with { type: 'json' }

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BATCH_SIZE = 25

// ── RSI (Wilder's, 14-period) — same formula as api/screener.js's calcRSI,
// kept local since that file's version takes closes[] not candles[]. ───────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null
  const ch = closes.slice(1).map((c, i) => c - closes[i])
  let g = ch.slice(0, period).reduce((a, b) => a + Math.max(b, 0), 0) / period
  let l = ch.slice(0, period).reduce((a, b) => a + Math.max(-b, 0), 0) / period
  for (let i = period; i < ch.length; i++) {
    g = (g * (period - 1) + Math.max(ch[i], 0)) / period
    l = (l * (period - 1) + Math.max(-ch[i], 0)) / period
  }
  return l === 0 ? 100 : +(100 - 100 / (1 + g / l)).toFixed(2)
}

// ── Yahoo candles — same instantiation fix + chart()/historical() fallback
// as api/market.js's fetchYahooCandles, extended with a concurrency-capped
// batch wrapper for scanning ~500 tickers without bursting the unofficial
// endpoint. Kept local rather than importing from market.js so this file's
// batch behavior can't regress the single-ticker analysis path.
let _yahoo = null
async function getYahoo() {
  if (_yahoo) return _yahoo
  const { default: YahooFinance } = await import('yahoo-finance2')
  _yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })
  return _yahoo
}

async function fetchYahooCandles(sym) {
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
      chunk.map(async ticker => ({ ticker, closes: await fetchYahooCandles(ticker.replace(/\./g, '-')) }))
    )
    out.push(...results)
  }
  return out
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function handleStart(req, res, supabase) {
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

async function handleTick(req, res, supabase) {
  const jobId = req.body?.jobId
  if (!jobId) { res.status(400).json({ error: 'jobId required' }); return }

  const { data: job, error: jobErr } = await supabase.from('scan_jobs').select('*').eq('id', jobId).single()
  if (jobErr || !job) { res.status(404).json({ error: 'Job not found' }); return }

  if (job.status === 'done') {
    res.status(200).json({ status: 'done', processed: job.processed, total: job.total, failedCount: job.failed_count })
    return
  }

  const batch = sp500.slice(job.cursor, job.cursor + BATCH_SIZE)
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
  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

  if (req.method === 'POST' && req.query.type === 'start') return handleStart(req, res, supabase)
  if (req.method === 'POST' && req.query.type === 'tick')  return handleTick(req, res, supabase)
  res.status(405).end()
}
