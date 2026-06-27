// Vercel Cron — Conviction Log 30-day follow-up.
// Runs once per day. For every conviction_entries row older than 30 days
// that hasn't sent a follow-up yet, composes an AI-generated check-in
// email referencing the user's original thesis + current price action.
//
// Schedule: `0 14 * * 1-5` (09:00 ET in DST — morning paper read).

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GROQ_API_KEY     = process.env.GROQ_API_KEY
const FINNHUB_API_KEY  = process.env.FINNHUB_API_KEY
const RESEND_API_KEY   = process.env.RESEND_API_KEY
const CRON_SECRET      = process.env.CRON_SECRET

const FOLLOWUP_AGE_DAYS = 30

async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return { price: d.c ?? null, changePct: d.dp ?? null }
  } catch { return null }
}

async function composeFollowup({ entry, currentPrice }) {
  const capturedPrice = Number(entry.captured_price) || 0
  const move = capturedPrice > 0 && currentPrice
    ? ((currentPrice - capturedPrice) / capturedPrice) * 100
    : null

  if (!GROQ_API_KEY) {
    return move != null
      ? `Thirty days ago you said: "${entry.thesis}" ${entry.ticker} is ${move >= 0 ? 'up' : 'down'} ${Math.abs(move).toFixed(1)}% since. Still holding the thesis?`
      : `Thirty days ago you said: "${entry.thesis}" Where do you stand now?`
  }
  const prompt = `You are following up on a user's investment thesis 30 days later.

Ticker: ${entry.ticker}
Original thesis (30 days ago): "${entry.thesis}"
Captured price: $${capturedPrice.toFixed(2)}
Kairo verdict at capture: ${entry.captured_verdict ?? 'N/A'} (${entry.captured_confidence ?? 'N/A'}% conf)
Current price: $${currentPrice?.toFixed(2) ?? 'N/A'}
Move since: ${move != null ? (move >= 0 ? '+' : '') + move.toFixed(1) + '%' : 'N/A'}

Write a single follow-up question to the user — referencing their original thesis specifically, the move since, and asking a pointed question about whether they're still holding the thesis. Max 60 words. No "as an AI". No hedging.`

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
    if (!r.ok) return composeFollowup.fallback(entry, move)
    const json = await r.json()
    return json.choices?.[0]?.message?.content?.trim() || composeFollowup.fallback(entry, move)
  } catch { return composeFollowup.fallback(entry, move) }
}
composeFollowup.fallback = (entry, move) =>
  move != null
    ? `Thirty days ago you said: "${entry.thesis}" ${entry.ticker} is ${move >= 0 ? 'up' : 'down'} ${Math.abs(move).toFixed(1)}% since. Still holding the thesis?`
    : `Thirty days ago you said: "${entry.thesis}" Where do you stand now?`

function emailHtml({ ticker, body }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080c0a;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080c0a;padding:40px 16px;">
<tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="padding-bottom:20px;border-bottom:1px solid #1a2e1f;">
    <span style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;font-family:Georgia,serif;">kairo</span><br>
    <span style="font-size:9px;color:#4b6358;letter-spacing:0.3em;text-transform:uppercase;">30-day Thesis Check-in</span>
  </td></tr>
  <tr><td height="20"></td></tr>
  <tr><td style="background:#0f1611;border:1px solid #1a2e1f;border-radius:12px;padding:28px;">
    <div style="font-size:32px;font-weight:800;color:#fff;line-height:1;margin-bottom:14px;">${ticker}</div>
    <div style="font-size:15px;color:#d1d9d5;line-height:1.7;">${body}</div>
  </td></tr>
  <tr><td height="20"></td></tr>
  <tr><td align="center">
    <a href="https://kairo-iota-red.vercel.app/t/${ticker}" style="display:inline-block;background:#22B585;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:13px 32px;border-radius:8px;">Open ${ticker} &rarr;</a>
  </td></tr>
</table></td></tr></table></body></html>`
}

export default async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron']
  const secretOk     = CRON_SECRET && req.query?.secret === CRON_SECRET
  if (!isVercelCron && !secretOk) return res.status(401).json({ error: 'Unauthorized' })

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

  const cutoff = new Date(Date.now() - FOLLOWUP_AGE_DAYS * 86_400_000).toISOString()
  const { data: pending } = await supabase
    .from('conviction_entries')
    .select('id, user_id, ticker, thesis, captured_verdict, captured_confidence, captured_price, created_at')
    .is('followup_sent_at', null)
    .lte('created_at', cutoff)
    .limit(50)

  if (!pending?.length) return res.json({ ok: true, sent: 0 })

  let sent = 0
  for (const entry of pending) {
    try {
      const { data: userResp } = await supabase.auth.admin.getUserById(entry.user_id)
      const email = userResp?.user?.email
      if (!email) continue

      const quote = await fetchQuote(entry.ticker)
      const body  = await composeFollowup({ entry, currentPrice: quote?.price })

      if (RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from:    'Kairo Coach <onboarding@resend.dev>',
            to:      email,
            subject: `${entry.ticker} — 30-day thesis check-in`,
            html:    emailHtml({ ticker: entry.ticker, body }),
          }),
        }).catch(() => {})
      }

      await supabase
        .from('conviction_entries')
        .update({ followup_sent_at: new Date().toISOString() })
        .eq('id', entry.id)

      sent += 1
    } catch { /* skip */ }
  }

  res.json({ ok: true, sent })
}
