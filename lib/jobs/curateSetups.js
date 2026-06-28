// Vercel Cron — daily setup curator. Scans a fixed universe of ~30 large-cap
// tickers + ETFs, classifies notable price-action setups, generates a
// one-line AI thesis for each, and writes the top 6-8 into public.setups.
//
// Schedule: `0 12 * * 1-5` (07:00 ET in DST — runs before The Open Brief).
//
// Universe is intentionally curated — quality over breadth. Expanding to
// a true ~500-ticker scan needs a separate paid-tier data feed; the current
// scan keeps daily Finnhub usage well inside the free-tier budget.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GROQ_API_KEY     = process.env.GROQ_API_KEY
const FINNHUB_API_KEY  = process.env.FINNHUB_API_KEY
const CRON_SECRET      = process.env.CRON_SECRET

// Curated cross-sector universe — covers macro, tech, semis, banks, energy,
// consumer, healthcare, crypto-adjacent, defensives.
const UNIVERSE = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'META', 'TSLA', 'AMD',
  'AVGO', 'CRM', 'ORCL', 'NFLX', 'COIN',
  'JPM', 'BAC', 'GS', 'WFC',
  'XOM', 'CVX', 'OXY',
  'COST', 'WMT', 'HD',
  'JNJ', 'UNH', 'LLY',
  'GLD', 'TLT',
]

async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return {
      symbol,
      price:        d.c,
      change:       d.d,
      changePct:    d.dp,
      high:         d.h,
      low:          d.l,
      open:         d.o,
      prevClose:    d.pc,
    }
  } catch { return null }
}

// Setup classification rules:
//   - Breakout above 52w: deferred (needs metrics endpoint)
//   - Big intraday gap: open vs prev close > 2%
//   - Strong day: changePct > 3% with hl range > 2.5%
//   - Oversold-bounce candidate: changePct between -5% and -3%
//   - Quiet outperformer: small green move on a red broader-market day
function classify(q, spyChange) {
  if (q.price == null || q.changePct == null) return null
  const gap = q.open && q.prevClose ? ((q.open - q.prevClose) / q.prevClose) * 100 : 0
  const range = q.high && q.low ? ((q.high - q.low) / q.low) * 100 : 0

  if (q.changePct >= 3 && range >= 2.5) {
    return { kind: 'Strong day', score: Math.min(10, q.changePct), reason: `Up ${q.changePct.toFixed(2)}% on a ${range.toFixed(1)}% range — momentum breakout` }
  }
  if (q.changePct <= -3 && q.changePct >= -8) {
    return { kind: 'Oversold candidate', score: Math.abs(q.changePct), reason: `Down ${Math.abs(q.changePct).toFixed(2)}% — potential bounce setup` }
  }
  if (Math.abs(gap) >= 2.5) {
    return { kind: 'Gap setup', score: Math.abs(gap), reason: `Gapped ${gap >= 0 ? 'up' : 'down'} ${Math.abs(gap).toFixed(2)}% from prior close` }
  }
  if (spyChange != null && spyChange < -0.5 && q.changePct > 0.5) {
    return { kind: 'Relative strength', score: q.changePct - spyChange, reason: `Up ${q.changePct.toFixed(2)}% while SPY is ${spyChange.toFixed(2)}%` }
  }
  return null
}

async function generateThesis({ symbol, kind, reason }) {
  if (!GROQ_API_KEY) return reason
  const prompt = `Write ONE crisp sentence — max 22 words — explaining the trading setup for ${symbol}: ${reason}. No "as an AI". No hedging. Specific and actionable.`
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
      }),
    })
    if (!r.ok) return reason
    const json = await r.json()
    return json.choices?.[0]?.message?.content?.trim() || reason
  } catch { return reason }
}

export default async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron']
  const secretOk     = CRON_SECRET && req.query?.secret === CRON_SECRET
  if (!isVercelCron && !secretOk) return res.status(401).json({ error: 'Unauthorized' })

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
  const today = new Date().toISOString().slice(0, 10)

  // Idempotency — if today already has rows, skip.
  const { data: existing } = await supabase
    .from('setups').select('id').eq('date', today).limit(1)
  if (existing?.length) return res.json({ ok: true, skipped: 'already-curated' })

  const quotes = await Promise.all(UNIVERSE.map(fetchQuote))
  const valid  = quotes.filter(q => q && q.price != null)
  const spy    = valid.find(q => q.symbol === 'SPY')
  const spyChange = spy?.changePct ?? null

  // Score + classify everything; pick top 8.
  const scored = valid
    .map(q => {
      const cls = classify(q, spyChange)
      return cls ? { q, ...cls } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  if (!scored.length) return res.json({ ok: true, curated: 0 })

  // Generate AI thesis for each (sequential to keep Groq rate-limit-friendly).
  const rows = []
  for (const s of scored) {
    const thesis = await generateThesis({ symbol: s.q.symbol, kind: s.kind, reason: s.reason })
    rows.push({
      date:       today,
      ticker:     s.q.symbol,
      kind:       s.kind,
      thesis,
      score:      s.score,
      change_pct: s.q.changePct,
      price:      s.q.price,
    })
  }

  const { error } = await supabase.from('setups').insert(rows)
  if (error) return res.status(500).json({ error: error.message })

  res.json({ ok: true, curated: rows.length })
}
