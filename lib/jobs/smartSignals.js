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

// Defaults for the technical-threshold archetypes. Overridable per-user via
// profile columns (smart_signals_rsi_oversold, smart_signals_rsi_overbought,
// smart_signals_earnings_days) — the fields fall back to these when unset.
const DEFAULT_RSI_OVERSOLD    = 30
const DEFAULT_RSI_OVERBOUGHT  = 70
const DEFAULT_EARNINGS_DAYS   = 5

async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return { symbol, price: d.c ?? null, change: d.d ?? null, changePct: d.dp ?? null }
  } catch { return null }
}

// Daily candles from Finnhub for the last ~40 sessions — enough for RSI(14)
// and BB(20) plus a lookback buffer to detect a fresh cross vs a
// long-standing extreme reading. Returns { closes[], highs[], lows[] } or
// null on any error.
async function fetchDailyCandles(symbol, days = 60) {
  if (!FINNHUB_API_KEY) return null
  const to   = Math.floor(Date.now() / 1000)
  const from = to - days * 86400
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`
    )
    if (!r.ok) return null
    const d = await r.json()
    if (d.s !== 'ok' || !Array.isArray(d.c) || d.c.length < 25) return null
    return { closes: d.c, highs: d.h, lows: d.l, times: d.t }
  } catch { return null }
}

// Nearest upcoming earnings date for a ticker via Finnhub's earnings-calendar
// endpoint. Returns { date: 'YYYY-MM-DD', daysAway } or null.
async function fetchNextEarnings(symbol) {
  if (!FINNHUB_API_KEY) return null
  const from = new Date().toISOString().slice(0, 10)
  const to   = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`
    )
    if (!r.ok) return null
    const d = await r.json()
    const cal = Array.isArray(d.earningsCalendar) ? d.earningsCalendar : []
    if (!cal.length) return null
    const upcoming = cal
      .filter(c => c.date)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
    if (!upcoming) return null
    const now = Date.now()
    const daysAway = Math.round((new Date(upcoming.date).getTime() - now) / 86400_000)
    if (daysAway < 0) return null
    return { date: upcoming.date, daysAway, hour: upcoming.hour ?? null }
  } catch { return null }
}

// Wilder's RSI over a series of closes. Returns the last value or null when
// the series is too short.
function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  let avgG = gains / period
  let avgL = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const g = Math.max(diff, 0)
    const l = Math.max(-diff, 0)
    avgG = (avgG * (period - 1) + g) / period
    avgL = (avgL * (period - 1) + l) / period
  }
  if (avgL === 0) return 100
  return +(100 - 100 / (1 + avgG / avgL)).toFixed(2)
}

// Return { rsi, rsiPrev } so we can distinguish a fresh cross from a
// long-standing extreme reading (the alert should fire only on the cross).
function computeRSIWithPrev(closes, period = 14) {
  if (closes.length < period + 2) return { rsi: null, rsiPrev: null }
  const rsi     = computeRSI(closes, period)
  const rsiPrev = computeRSI(closes.slice(0, -1), period)
  return { rsi, rsiPrev }
}

// Standard 20-period, 2σ Bollinger Bands over the closes series. Returns
// the last {upper, middle, lower, close} plus the previous close so a fresh
// cross can be identified. Null when the series is too short.
function computeBB(closes, period = 20) {
  if (closes.length < period + 1) return null
  const bandsAt = i => {
    const slice = closes.slice(i - period + 1, i + 1)
    const mean  = slice.reduce((a, b) => a + b, 0) / period
    const varr  = slice.reduce((s, c) => s + (c - mean) ** 2, 0) / period
    const std   = Math.sqrt(varr)
    return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std }
  }
  const last     = closes.length - 1
  const nowBand  = bandsAt(last)
  const prevBand = bandsAt(last - 1)
  return {
    ...nowBand,
    close:      closes[last],
    prevClose:  closes[last - 1],
    prevLower:  prevBand.lower,
    prevUpper:  prevBand.upper,
  }
}

function emailHtml({ ticker, headline, body, kind }) {
  const kindLabel = {
    signal_flipped:  'Signal Flipped',
    take_profits:    'Take Profits?',
    stop_hit:        'Stop Triggered',
    earnings_primer: 'Earnings Soon',
    macro_impact:    'Macro Event',
    bb_break:        'Bollinger Break',
    rsi_extreme:     'RSI Extreme',
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

// ARCHETYPE: Bollinger Band Break — price closed OUTSIDE the 20/2σ band
// on the last session AND was inside on the prior session. Detects a fresh
// cross, not a stale extreme. Lower band = potential bounce/oversold setup;
// upper band = potential reversal.
function detectBBBreak({ ticker, bb }) {
  if (!bb || !Number.isFinite(bb.close) || !Number.isFinite(bb.prevClose)) return null
  const belowLowerNow  = bb.close < bb.lower
  const belowLowerPrev = bb.prevClose < bb.prevLower
  const aboveUpperNow  = bb.close > bb.upper
  const aboveUpperPrev = bb.prevClose > bb.prevUpper

  if (belowLowerNow && !belowLowerPrev) {
    return {
      ticker, kind: 'bb_break',
      headline: `${ticker} just crossed its lower Bollinger Band`,
      body: `${ticker} closed at $${bb.close.toFixed(2)}, below its lower Bollinger Band of $${bb.lower.toFixed(2)}. Statistically stretched — potential mean-reversion setup. Middle band sits at $${bb.middle.toFixed(2)}.`,
      context: { side: 'lower', close: bb.close, band: bb.lower, middle: bb.middle },
    }
  }
  if (aboveUpperNow && !aboveUpperPrev) {
    return {
      ticker, kind: 'bb_break',
      headline: `${ticker} just crossed its upper Bollinger Band`,
      body: `${ticker} closed at $${bb.close.toFixed(2)}, above its upper Bollinger Band of $${bb.upper.toFixed(2)}. Overextended — reversal risk elevated. Middle band sits at $${bb.middle.toFixed(2)}.`,
      context: { side: 'upper', close: bb.close, band: bb.upper, middle: bb.middle },
    }
  }
  return null
}

// ARCHETYPE: RSI Extreme — RSI crossed INTO oversold (≤ oversold threshold)
// or INTO overbought (≥ overbought threshold) on the last session. Fires
// only on the fresh cross, not for a ticker that's been stuck at RSI 25
// for a week — the previous-session guard prevents alert fatigue.
function detectRSIExtreme({ ticker, rsi, rsiPrev, oversold, overbought }) {
  if (rsi == null || rsiPrev == null) return null
  if (rsi <= oversold && rsiPrev > oversold) {
    return {
      ticker, kind: 'rsi_extreme',
      headline: `RSI just flipped oversold on ${ticker}`,
      body: `${ticker}'s daily RSI(14) dropped to <strong>${rsi.toFixed(1)}</strong> (from ${rsiPrev.toFixed(1)}), crossing the ${oversold} oversold line. Historically the setup Kairo flags for a technical bounce watch.`,
      context: { side: 'oversold', rsi, rsiPrev, threshold: oversold },
    }
  }
  if (rsi >= overbought && rsiPrev < overbought) {
    return {
      ticker, kind: 'rsi_extreme',
      headline: `RSI just flipped overbought on ${ticker}`,
      body: `${ticker}'s daily RSI(14) climbed to <strong>${rsi.toFixed(1)}</strong> (from ${rsiPrev.toFixed(1)}), crossing the ${overbought} overbought line. Momentum extreme — pullback risk elevated.`,
      context: { side: 'overbought', rsi, rsiPrev, threshold: overbought },
    }
  }
  return null
}

// ARCHETYPE: Earnings Primer — company reports within `windowDays`. Fires
// once per report; the 12h cooldown + per-report date context stops the
// alert from spamming as the window narrows.
function detectEarningsPrimer({ ticker, earnings, windowDays }) {
  if (!earnings || earnings.daysAway == null) return null
  if (earnings.daysAway > windowDays) return null
  const timing = earnings.hour === 'bmo' ? 'before the bell'
              : earnings.hour === 'amc' ? 'after the close'
              : 'this session'
  const humanized = earnings.daysAway === 0 ? 'today'
                : earnings.daysAway === 1 ? 'tomorrow'
                : `in ${earnings.daysAway} days`
  return {
    ticker, kind: 'earnings_primer',
    headline: `${ticker} reports earnings ${humanized}`,
    body: `${ticker} is scheduled to report on <strong>${earnings.date}</strong> ${timing}. Implied volatility typically spikes into the print — check Kairo's read before deciding whether to hold through, trim, or hedge.`,
    context: { date: earnings.date, days_away: earnings.daysAway, hour: earnings.hour },
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

  // Pull opted-in users. Includes per-user RSI thresholds + earnings window
  // when set — otherwise falls back to the module defaults.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, smart_signals_enabled, smart_signals_rsi_oversold, smart_signals_rsi_overbought, smart_signals_earnings_days')
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

      // ARCHETYPES 3-5: technical + earnings scans, per Phase 5 spec.
      // Runs one Finnhub candles fetch + one earnings-calendar fetch per
      // ticker; capped at 10 tickers per user per invocation so a giant
      // watchlist doesn't blow the Finnhub free-tier 60/min limit.
      const rsiOversold   = profile.smart_signals_rsi_oversold   ?? DEFAULT_RSI_OVERSOLD
      const rsiOverbought = profile.smart_signals_rsi_overbought ?? DEFAULT_RSI_OVERBOUGHT
      const earningsWin   = profile.smart_signals_earnings_days  ?? DEFAULT_EARNINGS_DAYS

      for (const ticker of tickers.slice(0, 10)) {
        // Bollinger Band + RSI need the same candle series — fetch once.
        const candles = await fetchDailyCandles(ticker)
        if (candles?.closes?.length) {
          const bb = computeBB(candles.closes)
          const bbSignal = detectBBBreak({ ticker, bb })
          evaluated += 1
          if (bbSignal && !(await alreadyFired({ supabase, userId: profile.id, ticker, kind: bbSignal.kind }))) {
            await fire({ supabase, profile, email, signal: bbSignal })
            fired += 1
          }

          const { rsi, rsiPrev } = computeRSIWithPrev(candles.closes)
          const rsiSignal = detectRSIExtreme({ ticker, rsi, rsiPrev, oversold: rsiOversold, overbought: rsiOverbought })
          evaluated += 1
          if (rsiSignal && !(await alreadyFired({ supabase, userId: profile.id, ticker, kind: rsiSignal.kind }))) {
            await fire({ supabase, profile, email, signal: rsiSignal })
            fired += 1
          }
        }

        // Earnings scan — independent of candles; needs Finnhub calendar.
        const earnings = await fetchNextEarnings(ticker)
        if (earnings) {
          const earnSignal = detectEarningsPrimer({ ticker, earnings, windowDays: earningsWin })
          evaluated += 1
          if (earnSignal && !(await alreadyFired({ supabase, userId: profile.id, ticker, kind: earnSignal.kind }))) {
            await fire({ supabase, profile, email, signal: earnSignal })
            fired += 1
          }
        }
      }
    } catch { /* skip this user */ }
  }

  res.json({ ok: true, evaluated, fired })
}
