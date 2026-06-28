// Vercel Cron — runs every 5 min during market hours. Pulls all watchlist
// rows with email_alerts = true + alert_price set + not-recently-fired,
// quotes each ticker, fires the notify-price-alert edge function whenever
// the threshold is crossed.
//
// Wired in vercel.json under `crons`. Authenticated by Vercel's automatic
// x-vercel-cron header (in production); rejects everything else.

import { createClient } from '@supabase/supabase-js'
import { getMarketState } from '../../src/utils/marketHours.js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FINNHUB_API_KEY  = process.env.FINNHUB_API_KEY
const CRON_SECRET      = process.env.CRON_SECRET

// 6-hour cool-down between fires per (user, ticker) — prevents alert spam
// when a price oscillates around the threshold.
const COOLDOWN_HOURS = 6

async function fetchQuotes(symbols) {
  if (!FINNHUB_API_KEY || !symbols.length) return {}
  const out = {}
  // Finnhub free tier allows ~60/min. Sequential is safer than parallel for
  // cron jobs touching a shared rate limit.
  for (const symbol of symbols) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
      if (!r.ok) continue
      const d = await r.json()
      if (d?.c != null) out[symbol] = d.c
    } catch { /* skip this ticker */ }
  }
  return out
}

export default async function handler(req, res) {
  // Vercel sets x-vercel-cron in production; local invocations can pass
  // ?secret=... matching CRON_SECRET to test.
  const isVercelCron = !!req.headers['x-vercel-cron']
  const secretOk     = CRON_SECRET && req.query?.secret === CRON_SECRET
  if (!isVercelCron && !secretOk) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY || !FINNHUB_API_KEY) {
    return res.status(500).json({ error: 'Service not configured' })
  }

  // Skip when the US market is closed — alerts are price-based, no point
  // checking when no new prints are coming. Also skip after-hours and pre-
  // market by default; the user gets the email when the regular session opens.
  if (getMarketState(new Date()).state !== 'open') {
    return res.json({ ok: true, skipped: 'market-closed' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

  // Pull candidate alerts.
  const cooldownAgo = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()
  const { data: rows, error } = await supabase
    .from('watchlists')
    .select('id, user_id, ticker, alert_price, alert_direction, last_fired_at')
    .eq('email_alerts', true)
    .not('alert_price', 'is', null)
    .or(`last_fired_at.is.null,last_fired_at.lt.${cooldownAgo}`)

  if (error) return res.status(500).json({ error: error.message })
  if (!rows?.length) return res.json({ ok: true, checked: 0 })

  // Unique ticker set for batch quote fetch.
  const tickers = [...new Set(rows.map(r => r.ticker))]
  const quotes  = await fetchQuotes(tickers)

  // Pull recipient emails. Tier the lookup so we don't hit auth N times.
  const userIds = [...new Set(rows.map(r => r.user_id))]
  const emails  = {}
  for (const uid of userIds) {
    try {
      const { data } = await supabase.auth.admin.getUserById(uid)
      if (data?.user?.email) emails[uid] = data.user.email
    } catch { /* skip user */ }
  }

  let fired = 0
  for (const row of rows) {
    const price = quotes[row.ticker]
    const recipient = emails[row.user_id]
    if (price == null || !recipient) continue

    const direction = row.alert_direction === 'below' ? 'below' : 'above'
    const crossed = direction === 'above'
      ? price >= Number(row.alert_price)
      : price <= Number(row.alert_price)
    if (!crossed) continue

    try {
      // Service-role JWT clears Supabase's gateway-level JWT verification;
      // x-cron-secret is the secondary check inside the edge function.
      const r = await fetch(`${SUPABASE_URL}/functions/v1/notify-price-alert`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_SVC_KEY}`,
          'x-cron-secret': CRON_SECRET ?? '',
        },
        body: JSON.stringify({
          watchlistId:  row.id,
          ticker:       row.ticker,
          direction,
          threshold:    Number(row.alert_price),
          currentPrice: price,
          email:        recipient,
        }),
      })
      if (r.ok) fired += 1
    } catch { /* skip; the row keeps last_fired_at unchanged and will retry next tick */ }
  }

  res.json({ ok: true, checked: rows.length, fired })
}
