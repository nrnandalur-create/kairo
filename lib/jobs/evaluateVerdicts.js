// Vercel Cron — backfills forward-return outcomes on verdict_history.
// Runs daily after the close. For every verdict_history row that's old
// enough (5d/30d/90d) and has a null forward-price column, fetches the
// quote and stamps it.
//
// Schedule: `0 22 * * 1-5` (17:00 ET in DST, after the close).

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FINNHUB_API_KEY  = process.env.FINNHUB_API_KEY
const CRON_SECRET      = process.env.CRON_SECRET

const HORIZONS = [
  { col: 'price_at_5d',  daysMin:  5,  daysMax: 14 },
  { col: 'price_at_30d', daysMin: 30,  daysMax: 60 },
  { col: 'price_at_90d', daysMin: 90,  daysMax: 365 },
]

async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return d.c ?? null
  } catch { return null }
}

export default async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron']
  const secretOk     = CRON_SECRET && req.query?.secret === CRON_SECRET
  if (!isVercelCron && !secretOk) return res.status(401).json({ error: 'Unauthorized' })

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

  let evaluated = 0
  const tickerCache = {}   // dedupe price lookups within this run

  for (const horizon of HORIZONS) {
    const now = Date.now()
    const minDate = new Date(now - horizon.daysMax * 86_400_000).toISOString()
    const maxDate = new Date(now - horizon.daysMin * 86_400_000).toISOString()

    const { data: pending } = await supabase
      .from('verdict_history')
      .select('id, ticker')
      .is(horizon.col, null)
      .gte('viewed_at', minDate)
      .lte('viewed_at', maxDate)
      .limit(500)

    if (!pending?.length) continue

    for (const row of pending) {
      const price = tickerCache[row.ticker] ?? (tickerCache[row.ticker] = await fetchQuote(row.ticker))
      if (price == null) continue
      await supabase
        .from('verdict_history')
        .update({ [horizon.col]: price, evaluated_at: new Date().toISOString() })
        .eq('id', row.id)
      evaluated += 1
    }
  }

  res.json({ ok: true, evaluated })
}
