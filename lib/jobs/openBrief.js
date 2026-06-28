// Vercel Cron — runs 08:30 ET on every weekday. For every user opted into
// `email_open_brief`, composes a personalized morning brief using their
// watchlist + recent verdicts + market context, persists it to
// public.daily_briefs, and emails it via Resend.
//
// Schedule: 30 13 * * 1-5 in vercel.json (08:30 ET in DST; 09:30 ET in
// standard time. The market opens 09:30 ET so DST-aligned firing is the
// right priority. Standard-time users get the brief at-bell, still useful.)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GROQ_API_KEY     = process.env.GROQ_API_KEY
const FINNHUB_API_KEY  = process.env.FINNHUB_API_KEY
const RESEND_API_KEY   = process.env.RESEND_API_KEY
const CRON_SECRET      = process.env.CRON_SECRET

const FUTURES = ['SPY', 'QQQ', 'IWM']

async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return { symbol, price: d.c ?? null, change: d.d ?? null, changePct: d.dp ?? null }
  } catch { return null }
}

async function fetchMarketContext() {
  const quotes = await Promise.all(FUTURES.map(fetchQuote))
  return quotes.filter(Boolean)
}

async function composeBrief({ user, watchlist, watchlistQuotes, recentVerdicts, marketContext }) {
  if (!GROQ_API_KEY) {
    return basicBrief({ watchlist, watchlistQuotes, marketContext })
  }
  // Compose the prompt context — keep it tight.
  const wlCtx = watchlistQuotes.length
    ? watchlistQuotes.map(q =>
        `${q.symbol}: ${q.price != null ? `$${q.price.toFixed(2)}` : '—'} (${q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—'})`
      ).join('; ')
    : 'No watchlist'

  const mkCtx = marketContext.map(q =>
    `${q.symbol} ${q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—'}`
  ).join(', ')

  const recentCtx = recentVerdicts.slice(0, 5).map(v =>
    `${v.ticker} ${v.verdict} @ ${v.confidence}% conf`
  ).join('; ') || 'no recent verdicts'

  const prompt = `You are writing a personalized morning markets brief for a Kairo user.

Today's market context: ${mkCtx}
User's watchlist movers (pre-market): ${wlCtx}
User's last 5 Kairo verdicts: ${recentCtx}

Write a tight, professional brief in markdown — 4-5 short sections:
1. "Market context" — 1 sentence on what futures and macros are doing.
2. "Your watchlist" — 1-2 sentences on the most interesting mover in their list.
3. "Watch today" — 1-2 specific names from their watchlist or recent verdicts and what could matter.
4. "Today's setup" — 1 sentence on the overall risk posture.

Rules: No disclaimers, no "as an AI", no hedging. Be specific and confident. Cite numbers from the context above. Max ~140 words total. Use markdown headers like "## Market context".`

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body:    JSON.stringify({
        model:    'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    })
    if (!r.ok) return basicBrief({ watchlist, watchlistQuotes, marketContext })
    const json = await r.json()
    const md   = json.choices?.[0]?.message?.content?.trim()
    return md || basicBrief({ watchlist, watchlistQuotes, marketContext })
  } catch { return basicBrief({ watchlist, watchlistQuotes, marketContext }) }
}

function basicBrief({ watchlist, watchlistQuotes, marketContext }) {
  const mk = marketContext.map(q =>
    `${q.symbol} ${q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—'}`
  ).join(', ')
  const wl = watchlistQuotes.length
    ? watchlistQuotes.slice(0, 3).map(q => `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2) ?? '—'}%`).join(', ')
    : 'Add tickers to your watchlist for personalized briefs.'
  return `## Market context\n${mk}\n\n## Your watchlist\n${wl}`
}

function emailHtml({ md, dateStr }) {
  // Lightweight markdown → HTML for our specific subset (## headers, paragraphs).
  const html = md
    .split('\n\n')
    .map(block => {
      const trimmed = block.trim()
      if (trimmed.startsWith('## ')) {
        return `<h2 style="font-size:11px;color:#4b6358;text-transform:uppercase;letter-spacing:0.15em;margin:18px 0 6px;font-weight:700;">${trimmed.slice(3)}</h2>`
      }
      return `<p style="font-size:14px;color:#d1d9d5;line-height:1.7;margin:0 0 6px;">${trimmed}</p>`
    })
    .join('\n')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kairo Open Brief</title></head>
<body style="margin:0;padding:0;background:#080c0a;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080c0a;padding:40px 16px;">
<tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="padding-bottom:20px;border-bottom:1px solid #1a2e1f;">
    <span style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;font-family:Georgia,serif;">kairo</span><br>
    <span style="font-size:9px;color:#4b6358;letter-spacing:0.3em;text-transform:uppercase;">Open Brief · ${dateStr}</span>
  </td></tr>
  <tr><td height="20"></td></tr>
  <tr><td style="background:#0f1611;border:1px solid #1a2e1f;border-radius:12px;padding:24px;">${html}</td></tr>
  <tr><td height="20"></td></tr>
  <tr><td align="center">
    <a href="https://kairo-iota-red.vercel.app/" style="display:inline-block;background:#22B585;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:13px 32px;border-radius:8px;">Open Kairo &rarr;</a>
  </td></tr>
  <tr><td height="20"></td></tr>
  <tr><td style="border-top:1px solid #1a2e1f;padding-top:20px;text-align:center;">
    <span style="font-size:11px;color:#263d2c;line-height:1.7;">
      Kairo is for informational purposes only and does not constitute financial advice.<br>
      <a href="https://kairo-iota-red.vercel.app/" style="color:#4b6358;">Manage email preferences</a>
    </span>
  </td></tr>
</table></td></tr></table></body></html>`
}

export default async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron']
  const secretOk     = CRON_SECRET && req.query?.secret === CRON_SECRET
  if (!isVercelCron && !secretOk) return res.status(401).json({ error: 'Unauthorized' })

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) {
    return res.status(500).json({ error: 'Service not configured' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
  const today    = new Date().toISOString().slice(0, 10)
  const dateStr  = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  // Fetch market context once for everyone.
  const marketContext = await fetchMarketContext()

  // Pull opted-in users with their emails.
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, email_open_brief')
    .eq('email_open_brief', true)
  if (profErr) return res.status(500).json({ error: profErr.message })
  if (!profiles?.length) return res.json({ ok: true, sent: 0 })

  let sent = 0
  let skipped = 0

  for (const profile of profiles) {
    try {
      // Check if we already composed for this user today (idempotency).
      const { data: existing } = await supabase
        .from('daily_briefs')
        .select('id')
        .eq('user_id', profile.id)
        .eq('kind', 'open')
        .eq('date', today)
        .maybeSingle()
      if (existing) { skipped += 1; continue }

      const { data: userResp } = await supabase.auth.admin.getUserById(profile.id)
      const email = userResp?.user?.email
      if (!email) continue

      // User's watchlist + recent verdicts for personalization.
      const { data: watchlist }      = await supabase
        .from('watchlists')
        .select('ticker')
        .eq('user_id', profile.id)
      const { data: recentVerdicts } = await supabase
        .from('verdict_history')
        .select('ticker, verdict, confidence')
        .eq('user_id', profile.id)
        .order('viewed_at', { ascending: false })
        .limit(5)

      const watchlistTickers = (watchlist ?? []).map(w => w.ticker)
      const watchlistQuotes  = await Promise.all(watchlistTickers.slice(0, 10).map(fetchQuote))
      const cleanedQuotes    = watchlistQuotes.filter(q => q && q.changePct != null)

      const md = await composeBrief({
        user: profile,
        watchlist: watchlistTickers,
        watchlistQuotes: cleanedQuotes,
        recentVerdicts: recentVerdicts ?? [],
        marketContext,
      })

      const wlAvg = cleanedQuotes.length
        ? cleanedQuotes.reduce((sum, q) => sum + q.changePct, 0) / cleanedQuotes.length
        : null
      const spyChange = marketContext.find(q => q.symbol === 'SPY')?.changePct ?? null

      await supabase.from('daily_briefs').insert({
        user_id: profile.id,
        kind:    'open',
        date:    today,
        content_md: md,
        watchlist_change_pct: wlAvg,
        spy_change_pct:       spyChange,
      })

      if (RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from:    'Kairo Brief <onboarding@resend.dev>',
            to:      email,
            subject: `Kairo Open Brief — ${dateStr}`,
            html:    emailHtml({ md, dateStr }),
          }),
        }).catch(() => {})
      }
      sent += 1
    } catch { /* skip user; next tick will retry */ }
  }

  res.json({ ok: true, sent, skipped })
}
