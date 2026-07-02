// Vercel Cron — runs 08:30 ET on every weekday. For every user opted into
// `email_open_brief`, composes a personalized morning brief using their
// watchlist + recent verdicts + market context, persists it to
// public.daily_briefs, and emails it via Resend.
//
// Schedule: 30 13 * * 1-5 in vercel.json (08:30 ET in DST; 09:30 ET in
// standard time. The market opens 09:30 ET so DST-aligned firing is the
// right priority. Standard-time users get the brief at-bell, still useful.)

import { createClient } from '@supabase/supabase-js'
import { fetchQuote, fetchMarketContext, composeBrief, persistBrief } from '../briefs/composer.js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY   = process.env.RESEND_API_KEY
const CRON_SECRET      = process.env.CRON_SECRET

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

      // Shared composer — identical output shape to the on-demand endpoint
      // so the DailyBriefCard UI can't tell which surface generated the brief.
      const md = await composeBrief({
        watchlist:       watchlistTickers,
        watchlistQuotes: cleanedQuotes,
        recentVerdicts:  recentVerdicts ?? [],
        marketContext,
      })

      await persistBrief(supabase, {
        userId:    profile.id,
        kind:      'open',
        date:      today,
        contentMd: md,
        watchlistQuotes: cleanedQuotes,
        marketContext,
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
