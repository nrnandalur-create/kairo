// Vercel Cron — Close Wrap. Sibling of open-brief. Triggers ~16:30 ET on
// weekdays via vercel.json schedule `30 21 * * 1-5` (16:30 ET in DST).
//
// Same plumbing as the morning brief; different prompt + different kind.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GROQ_API_KEY     = process.env.GROQ_API_KEY
const FINNHUB_API_KEY  = process.env.FINNHUB_API_KEY
const RESEND_API_KEY   = process.env.RESEND_API_KEY
const CRON_SECRET      = process.env.CRON_SECRET

async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return { symbol, price: d.c ?? null, change: d.d ?? null, changePct: d.dp ?? null }
  } catch { return null }
}

async function composeWrap({ watchlistQuotes, marketContext }) {
  if (!GROQ_API_KEY) return basicWrap({ watchlistQuotes, marketContext })

  const wlCtx = watchlistQuotes
    .map(q => `${q.symbol}: ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`)
    .join('; ')
  const mkCtx = marketContext
    .map(q => `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2) ?? '—'}%`)
    .join(', ')

  const prompt = `You are writing a personalized end-of-day markets wrap for a Kairo user.

Today's market close: ${mkCtx}
User's watchlist performance today: ${wlCtx}

Write a tight, professional wrap in markdown — 3 short sections:
1. "Your day" — 1-2 sentences summarizing watchlist vs market performance.
2. "What worked / what didn't" — name the top winner and biggest loser specifically with their %s.
3. "Tomorrow" — 1 sentence on what to keep an eye on.

Rules: No disclaimers, no AI self-reference, no hedging. Cite specific numbers. Max ~120 words total. Markdown ## headers.`

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body:    JSON.stringify({
        model:    'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
      }),
    })
    if (!r.ok) return basicWrap({ watchlistQuotes, marketContext })
    const json = await r.json()
    return json.choices?.[0]?.message?.content?.trim() || basicWrap({ watchlistQuotes, marketContext })
  } catch { return basicWrap({ watchlistQuotes, marketContext }) }
}

function basicWrap({ watchlistQuotes, marketContext }) {
  const mk = marketContext.map(q => `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2) ?? '—'}%`).join(', ')
  const wl = watchlistQuotes.length
    ? `Best: ${watchlistQuotes[0].symbol} ${watchlistQuotes[0].changePct >= 0 ? '+' : ''}${watchlistQuotes[0].changePct.toFixed(2)}%`
    : 'Add tickers to your watchlist for personalized wraps.'
  return `## Your day\n${wl}\n\n## Market close\n${mk}`
}

function emailHtml({ md, dateStr }) {
  const html = md.split('\n\n').map(block => {
    const t = block.trim()
    if (t.startsWith('## ')) return `<h2 style="font-size:11px;color:#4b6358;text-transform:uppercase;letter-spacing:0.15em;margin:18px 0 6px;font-weight:700;">${t.slice(3)}</h2>`
    return `<p style="font-size:14px;color:#d1d9d5;line-height:1.7;margin:0 0 6px;">${t}</p>`
  }).join('\n')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080c0a;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080c0a;padding:40px 16px;">
<tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="padding-bottom:20px;border-bottom:1px solid #1a2e1f;">
    <span style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;font-family:Georgia,serif;">kairo</span><br>
    <span style="font-size:9px;color:#4b6358;letter-spacing:0.3em;text-transform:uppercase;">Close Wrap · ${dateStr}</span>
  </td></tr>
  <tr><td height="20"></td></tr>
  <tr><td style="background:#0f1611;border:1px solid #1a2e1f;border-radius:12px;padding:24px;">${html}</td></tr>
  <tr><td height="20"></td></tr>
  <tr><td align="center">
    <a href="https://kairo-iota-red.vercel.app/" style="display:inline-block;background:#22B585;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:13px 32px;border-radius:8px;">Open Kairo &rarr;</a>
  </td></tr>
</table></td></tr></table></body></html>`
}

export default async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron']
  const secretOk     = CRON_SECRET && req.query?.secret === CRON_SECRET
  if (!isVercelCron && !secretOk) return res.status(401).json({ error: 'Unauthorized' })

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
  const today    = new Date().toISOString().slice(0, 10)
  const dateStr  = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const marketContext = await Promise.all(['SPY','QQQ','IWM'].map(fetchQuote)).then(r => r.filter(Boolean))

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email_close_wrap')
    .eq('email_close_wrap', true)
  if (!profiles?.length) return res.json({ ok: true, sent: 0 })

  let sent = 0
  for (const profile of profiles) {
    try {
      const { data: existing } = await supabase
        .from('daily_briefs')
        .select('id').eq('user_id', profile.id).eq('kind', 'close').eq('date', today).maybeSingle()
      if (existing) continue

      const { data: userResp } = await supabase.auth.admin.getUserById(profile.id)
      const email = userResp?.user?.email
      if (!email) continue

      const { data: watchlist } = await supabase.from('watchlists').select('ticker').eq('user_id', profile.id)
      const quotes = await Promise.all((watchlist ?? []).slice(0, 10).map(w => fetchQuote(w.ticker)))
      const cleaned = quotes.filter(q => q && q.changePct != null).sort((a, b) => b.changePct - a.changePct)

      const md = await composeWrap({ watchlistQuotes: cleaned, marketContext })
      const wlAvg = cleaned.length ? cleaned.reduce((s, q) => s + q.changePct, 0) / cleaned.length : null
      const spyChange = marketContext.find(q => q.symbol === 'SPY')?.changePct ?? null

      await supabase.from('daily_briefs').insert({
        user_id: profile.id, kind: 'close', date: today,
        content_md: md, watchlist_change_pct: wlAvg, spy_change_pct: spyChange,
      })

      if (RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'Kairo Wrap <onboarding@resend.dev>', to: email,
            subject: `Kairo Close Wrap — ${dateStr}`,
            html: emailHtml({ md, dateStr }),
          }),
        }).catch(() => {})
      }
      sent += 1
    } catch { /* skip */ }
  }
  res.json({ ok: true, sent })
}
