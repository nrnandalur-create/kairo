// Vercel Cron — Smart Notifications 2.0
// Runs every 30 min during US market hours weekdays. For every opted-in
// user, evaluates the five archetypes against their watchlist + portfolio
// + recent Kairo verdicts. Fires email when an archetype matches AND it
// hasn't already fired for the same (user, ticker, kind) in the last 12h.
//
// Schedule: `*/30 13-20 * * 1-5` (every 30 min, 13:00-20:30 UTC,
// covers 09:00-16:30 ET in DST).

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FINNHUB_API_KEY  = process.env.FINNHUB_API_KEY
const RESEND_API_KEY   = process.env.RESEND_API_KEY
const CRON_SECRET      = process.env.CRON_SECRET

const COOLDOWN_HOURS = 12

async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return { symbol, price: d.c ?? null, change: d.d ?? null, changePct: d.dp ?? null }
  } catch { return null }
}

function emailHtml({ ticker, headline, body, kind }) {
  const kindLabel = {
    signal_flipped:  'Signal Flipped',
    take_profits:    'Take Profits?',
    stop_hit:        'Stop Triggered',
    earnings_primer: 'Earnings Today',
    macro_impact:    'Macro Event',
  }[kind] || 'Smart Signal'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080c0a;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080c0a;padding:40px 16px;">
<tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="padding-bottom:20px;border-bottom:1px solid #1a2e1f;">
    <span style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;font-family:Georgia,serif;">kairo</span><br>
    <span style="font-size:9px;color:#4b6358;letter-spacing:0.3em;text-transform:uppercase;">${kindLabel}</span>
  </td></tr>
  <tr><td height="20"></td></tr>
  <tr><td style="background:#0f1611;border:1px solid #1a2e1f;border-radius:12px;padding:28px;">
    <div style="font-size:32px;font-weight:800;color:#fff;line-height:1;margin-bottom:14px;">${ticker}</div>
    <div style="font-size:16px;color:#22B585;font-weight:700;margin-bottom:14px;">${headline}</div>
    <div style="font-size:14px;color:#d1d9d5;line-height:1.6;">${body}</div>
  </td></tr>
  <tr><td height="20"></td></tr>
  <tr><td align="center">
    <a href="https://kairo-iota-red.vercel.app/t/${ticker}" style="display:inline-block;background:#22B585;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:13px 32px;border-radius:8px;">Open ${ticker} &rarr;</a>
  </td></tr>
</table></td></tr></table></body></html>`
}

// ARCHETYPE: Signal Flipped — verdict changed between the user's two most
// recent views of this ticker.
function detectSignalFlipped({ verdicts }) {
  if (!verdicts || verdicts.length < 2) return null
  const [latest, prev] = verdicts
  if (!latest.verdict || !prev.verdict) return null
  if (latest.verdict === prev.verdict) return null
  return {
    ticker:  latest.ticker,
    kind:    'signal_flipped',
    headline: `${prev.verdict} → ${latest.verdict}`,
    body:    `Kairo's verdict on ${latest.ticker} flipped from <strong>${prev.verdict}</strong> (${prev.confidence}% conf) to <strong>${latest.verdict}</strong> (${latest.confidence}% conf). Worth a fresh look.`,
    context: { from: prev.verdict, to: latest.verdict, prev_conf: prev.confidence, new_conf: latest.confidence },
  }
}

// ARCHETYPE: Take Profits — user has a portfolio holding up >15%, AND the
// most recent verdict on that ticker is HOLD or SELL (softer than BUY).
function detectTakeProfits({ holding, currentPrice, latestVerdict }) {
  if (!holding || !currentPrice || holding.avg_cost <= 0) return null
  const gainPct = ((currentPrice - holding.avg_cost) / holding.avg_cost) * 100
  if (gainPct < 15) return null
  const verdictSoft = latestVerdict?.verdict && latestVerdict.verdict !== 'BUY'
  if (!verdictSoft) return null
  return {
    ticker:   holding.ticker,
    kind:     'take_profits',
    headline: `You're up ${gainPct.toFixed(1)}% and the verdict softened`,
    body:     `Your <strong>${holding.ticker}</strong> position is up <strong>${gainPct.toFixed(1)}%</strong> from your cost basis of $${Number(holding.avg_cost).toFixed(2)}. Kairo just downgraded to <strong>${latestVerdict.verdict}</strong> at ${latestVerdict.confidence}% confidence. Consider trimming.`,
    context:  { gain_pct: gainPct, avg_cost: holding.avg_cost, current_price: currentPrice, verdict: latestVerdict.verdict },
  }
}

async function alreadyFired({ supabase, userId, ticker, kind }) {
  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60_000).toISOString()
  const { data } = await supabase
    .from('smart_signals_sent')
    .select('id')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .eq('kind', kind)
    .gte('fired_at', cutoff)
    .maybeSingle()
  return !!data
}

async function fire({ supabase, profile, email, signal }) {
  await supabase.from('smart_signals_sent').insert({
    user_id: profile.id,
    ticker:  signal.ticker,
    kind:    signal.kind,
    context: signal.context ?? null,
  })
  if (RESEND_API_KEY && email) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from:    'Kairo Signal <onboarding@resend.dev>',
        to:      email,
        subject: `${signal.ticker} — ${signal.headline}`,
        html:    emailHtml(signal),
      }),
    }).catch(() => {})
  }
}

export default async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron']
  const secretOk     = CRON_SECRET && req.query?.secret === CRON_SECRET
  if (!isVercelCron && !secretOk) return res.status(401).json({ error: 'Unauthorized' })

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

  // Pull opted-in users.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, smart_signals_enabled')
    .eq('smart_signals_enabled', true)
  if (!profiles?.length) return res.json({ ok: true, evaluated: 0, fired: 0 })

  let evaluated = 0
  let fired     = 0

  for (const profile of profiles) {
    try {
      const { data: userResp } = await supabase.auth.admin.getUserById(profile.id)
      const email = userResp?.user?.email
      if (!email) continue

      // Pull this user's holdings + watchlist + recent verdicts (per ticker
      // we want the latest two to detect flips).
      const [{ data: holdings = [] }, { data: watchlist = [] }] = await Promise.all([
        supabase.from('portfolio_holdings').select('ticker, shares, avg_cost').eq('user_id', profile.id),
        supabase.from('watchlists').select('ticker').eq('user_id', profile.id),
      ])

      const tickers = Array.from(new Set([
        ...holdings.map(h => h.ticker),
        ...watchlist.map(w => w.ticker),
      ])).filter(Boolean)
      if (!tickers.length) continue

      // Group verdict_history by ticker, keep two most recent per ticker.
      const verdictsByTicker = {}
      for (const ticker of tickers) {
        const { data } = await supabase
          .from('verdict_history')
          .select('ticker, verdict, confidence, price, viewed_at')
          .eq('user_id', profile.id)
          .eq('ticker', ticker)
          .order('viewed_at', { ascending: false })
          .limit(2)
        if (data?.length) verdictsByTicker[ticker] = data
      }

      // ARCHETYPE 1: Signal Flipped
      for (const ticker of tickers) {
        evaluated += 1
        const v = verdictsByTicker[ticker]
        const signal = detectSignalFlipped({ verdicts: v })
        if (!signal) continue
        if (await alreadyFired({ supabase, userId: profile.id, ticker, kind: signal.kind })) continue
        await fire({ supabase, profile, email, signal })
        fired += 1
      }

      // ARCHETYPE 2: Take Profits — needs portfolio holdings + a current quote.
      for (const holding of holdings) {
        evaluated += 1
        const q = await fetchQuote(holding.ticker)
        if (!q || q.price == null) continue
        const latestVerdict = verdictsByTicker[holding.ticker]?.[0]
        if (!latestVerdict) continue
        const signal = detectTakeProfits({ holding, currentPrice: q.price, latestVerdict })
        if (!signal) continue
        if (await alreadyFired({ supabase, userId: profile.id, ticker: holding.ticker, kind: signal.kind })) continue
        await fire({ supabase, profile, email, signal })
        fired += 1
      }

      // ARCHETYPES 3-5 (stop_hit, earnings_primer, macro_impact) are
      // scaffolded — schema + tracking work; detector wiring is the
      // remaining piece. Add their detect*() functions here.
    } catch { /* skip this user */ }
  }

  res.json({ ok: true, evaluated, fired })
}
