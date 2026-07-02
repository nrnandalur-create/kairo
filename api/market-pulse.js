import { rateLimit } from '../lib/rateLimit.js'

// Consolidated endpoint for The Pulse — handles both the live mover quotes
// (default GET) and the AI narration (POST with ?action=narrate). Two
// surfaces in one Vercel function so the project stays under the 12-function
// Hobby cap.

const INDICES = ['SPY', 'QQQ', 'DIA']
const MOVERS  = ['AAPL', 'TSLA', 'NVDA', 'AMZN', 'META', 'MSFT', 'GOOGL', 'AMD', 'INTC', 'NFLX']

// Wider universe for the front-door movers scan. Covers mega-cap tech, banks,
// energy, staples, semis, sector ETFs, and a batch of high-volatility retail
// favorites so gainers/losers reflect the market the user actually watches.
// Capped at 32 so 32 parallel Finnhub calls stay well under the 60/min free-
// tier cap, especially with the 2-minute cache below.
const MOVERS_UNIVERSE = [
  // Mega-cap tech
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','NFLX','AMD','INTC',
  // Semis + enterprise
  'AVGO','ORCL','CRM','ADBE','TSM',
  // Banks / financials
  'JPM','BAC','GS',
  // Energy + industrials
  'XOM','CVX','BA',
  // Consumer + healthcare
  'WMT','HD','DIS','KO','JNJ','UNH',
  // Sector + broad ETFs
  'SPY','QQQ','IWM','XLE','XLF',
]

// Names for tiny display labels next to symbols. Not exhaustive — falls back
// to just the symbol when a ticker isn't in the map.
const NAME_MAP = {
  AAPL: 'Apple',    MSFT: 'Microsoft', NVDA: 'NVIDIA',    AMZN: 'Amazon',
  META: 'Meta',     GOOGL:'Alphabet',   TSLA: 'Tesla',    NFLX: 'Netflix',
  AMD:  'AMD',      INTC: 'Intel',      AVGO: 'Broadcom', ORCL: 'Oracle',
  CRM:  'Salesforce',ADBE:'Adobe',      TSM:  'TSMC',
  JPM:  'JPMorgan', BAC:  'Bank of America', GS: 'Goldman Sachs',
  XOM:  'Exxon',    CVX:  'Chevron',    BA:   'Boeing',
  WMT:  'Walmart',  HD:   'Home Depot', DIS:  'Disney',   KO:  'Coca-Cola',
  JNJ:  'Johnson',  UNH:  'UnitedHealth',
  SPY:  'S&P 500',  QQQ:  'Nasdaq 100', IWM:  'Russell 2000',
  XLE:  'Energy Sector', XLF: 'Financials Sector',
}

const MAX_TICKERS = 12

async function fetchQuote(symbol, apiKey) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`)
    if (!r.ok) return { symbol, price: null, change: null, changePct: null }
    const d = await r.json()
    return { symbol, price: d.c ?? null, change: d.d ?? null, changePct: d.dp ?? null }
  } catch {
    return { symbol, price: null, change: null, changePct: null }
  }
}

// ── Narration short-path (was the standalone /api/pulse-narrate) ───────────
async function handleNarrate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GROQ_API_KEY ?? process.env.VITE_GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service unavailable' })

  const quotes = Array.isArray(req.body?.quotes) ? req.body.quotes.slice(0, MAX_TICKERS) : []
  const macros = Array.isArray(req.body?.macros) ? req.body.macros.slice(0, 5) : []
  if (!quotes.length) return res.status(400).json({ error: 'No quotes provided' })

  const wlCtx = quotes
    .filter(q => q.changePct != null)
    .map(q => `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`)
    .join(', ')
  const mkCtx = macros
    .filter(q => q.changePct != null)
    .map(q => `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`)
    .join(', ')

  const prompt = `Watchlist live: ${wlCtx}
Market: ${mkCtx}

Write ONE crisp sentence narrating what's happening across this user's watchlist right now relative to the broader market. Cite the biggest mover by name. No "as an AI". No hedging. Under 25 words.`

  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort('pulse-narrate:timeout'), 6000)

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:    'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
      }),
      signal: abort.signal,
    })
    clearTimeout(timeoutId)
    if (!r.ok) return res.status(502).json({ error: `AI service error (${r.status})` })
    const json = await r.json()
    const narration = json.choices?.[0]?.message?.content?.trim()
    res.json({ narration: narration ?? '' })
  } catch (err) {
    clearTimeout(timeoutId)
    const isAbort = err?.name === 'AbortError' || /abort|timeout/i.test(String(err?.message ?? ''))
    res.status(isAbort ? 504 : 502).json({ error: isAbort ? 'Narration timed out' : 'AI service error' })
  }
}

// ── Movers scan (Market Front Door — gainers + losers) ────────────────────
// Fires 32 parallel Finnhub quote calls, sorts by changePct, returns the
// top 5 gainers and top 5 losers. 2-minute edge cache means realistic burst
// traffic on the landing view lands on one Finnhub sync per user per two
// minutes, not per open.
async function handleMovers(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Service unavailable' })

  const results = await Promise.all(MOVERS_UNIVERSE.map(s => fetchQuote(s, apiKey)))
  const valid   = results
    .filter(q => q.price != null && q.changePct != null && Number.isFinite(q.changePct))
    .map(q => ({ ...q, name: NAME_MAP[q.symbol] ?? q.symbol }))

  const sorted  = [...valid].sort((a, b) => b.changePct - a.changePct)
  const gainers = sorted.filter(q => q.changePct > 0).slice(0, 5)
  const losers  = sorted.filter(q => q.changePct < 0).slice(-5).reverse()

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300')
  res.json({ gainers, losers, universeSize: valid.length, at: Date.now() })
}

// ── Default: indices + movers quotes ──────────────────────────────────────
async function handlePulseQuotes(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Service unavailable' })

  const all     = [...INDICES, ...MOVERS]
  const results = await Promise.all(all.map(s => fetchQuote(s, apiKey)))

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
  res.json({
    indices: results.slice(0, INDICES.length),
    movers:  results.slice(INDICES.length),
  })
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.query?.action === 'narrate') return handleNarrate(req, res)
  if (req.query?.action === 'movers')  return handleMovers(req, res)
  return handlePulseQuotes(req, res)
}

export const config = { maxDuration: 15 }
