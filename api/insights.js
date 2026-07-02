// Consolidated public read-only insights endpoint. Routes by ?kind=:
//   - ?kind=setups         → today's Setup Feed (was /api/setups)
//   - ?kind=track-record   → audited Kairo verdict aggregates (was /api/track-record)
//   - ?kind=morning-brief  → on-demand personalized Morning Brief for the
//                            signed-in caller. Returns today's persisted
//                            brief if one exists, else composes now, persists,
//                            and returns it.
//
// setups + track-record are public; morning-brief requires a Supabase JWT.

import { createClient } from '@supabase/supabase-js'
import { composeBrief, gatherBriefInputs, persistBrief } from '../lib/briefs/composer.js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── Setup Feed ────────────────────────────────────────────────────────────
async function handleSetups(req, res, supabase) {
  // Most recent setup date in the table (any one row tells us).
  const { data: latest } = await supabase
    .from('setups')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!latest) return res.json({ date: null, setups: [] })

  const { data: setups, error } = await supabase
    .from('setups')
    .select('ticker, kind, thesis, score, change_pct, price')
    .eq('date', latest.date)
    .order('score', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600')
  res.json({ date: latest.date, setups: setups ?? [] })
}

// ── Track Record ──────────────────────────────────────────────────────────
function aggregate(rows, horizonCol) {
  const evaluated = rows.filter(r => r[horizonCol] != null && r.price != null)
  if (!evaluated.length) return { count: 0, avgReturn: null, hitRate: null }
  let sum = 0, hits = 0
  for (const r of evaluated) {
    const ret = ((r[horizonCol] - r.price) / r.price) * 100
    sum += ret
    const hit =
      (r.verdict === 'BUY'  && ret > 0) ||
      (r.verdict === 'SELL' && ret < 0) ||
      (r.verdict === 'HOLD' && Math.abs(ret) < 3)
    if (hit) hits += 1
  }
  return {
    count:     evaluated.length,
    avgReturn: sum / evaluated.length,
    hitRate:   (hits / evaluated.length) * 100,
  }
}

async function handleTrackRecord(req, res, supabase) {
  const { data, error } = await supabase
    .from('verdict_history')
    .select('verdict, confidence, sector, price, price_at_5d, price_at_30d, price_at_90d')
    .limit(5000)
  if (error) return res.status(500).json({ error: error.message })
  if (!data?.length) {
    return res.json({ total: 0, message: 'Track record is empty — Kairo is still accumulating verdicts.' })
  }

  const byVerdict = { BUY: [], HOLD: [], SELL: [] }
  for (const r of data) if (byVerdict[r.verdict]) byVerdict[r.verdict].push(r)

  const byConfidenceBucket = { '60-70': [], '70-80': [], '80-90': [], '90+': [] }
  for (const r of data) {
    const c = r.confidence ?? 0
    if      (c >= 90) byConfidenceBucket['90+'].push(r)
    else if (c >= 80) byConfidenceBucket['80-90'].push(r)
    else if (c >= 70) byConfidenceBucket['70-80'].push(r)
    else if (c >= 60) byConfidenceBucket['60-70'].push(r)
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  res.json({
    total: data.length,
    overall: {
      d5:  aggregate(data, 'price_at_5d'),
      d30: aggregate(data, 'price_at_30d'),
      d90: aggregate(data, 'price_at_90d'),
    },
    byVerdict: Object.fromEntries(Object.entries(byVerdict).map(([k, rows]) => [k, {
      d5:  aggregate(rows, 'price_at_5d'),
      d30: aggregate(rows, 'price_at_30d'),
      d90: aggregate(rows, 'price_at_90d'),
    }])),
    byConfidenceBucket: Object.fromEntries(Object.entries(byConfidenceBucket).map(([k, rows]) => [k, {
      d30: aggregate(rows, 'price_at_30d'),
    }])),
  })
}

// ── Morning Brief (on-demand, per user) ───────────────────────────────────
// Returns today's persisted brief for the caller if one already exists (the
// cron may have run at 08:30 ET). Otherwise composes a new one via the
// shared composer + persists it, so the client renders the SAME brief the
// email delivery would have produced.
//
// Free tier: this endpoint ALWAYS returns the full brief. Free-tier gating
// (top-section-only + upgrade CTA) is enforced client-side so paywall logic
// stays in one place (useSubscription + UpgradeOverlay), not sprinkled
// across API handlers.
async function handleMorningBrief(req, res, supabase) {
  // Auth — Supabase JWT in the Authorization header, same pattern as
  // /api/stripe. Anonymous callers get a 401.
  const auth  = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  const { data: userResp, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userResp?.user) return res.status(401).json({ error: 'Not authenticated' })
  const userId = userResp.user.id

  const today = new Date().toISOString().slice(0, 10)

  // Serve cached row if already persisted for today. Prevents duplicate
  // Groq calls when the user reloads the app or opens it in multiple tabs.
  const { data: existing } = await supabase
    .from('daily_briefs')
    .select('id, kind, date, content_md, watchlist_change_pct, spy_change_pct, created_at')
    .eq('user_id', userId)
    .eq('kind', 'open')
    .eq('date', today)
    .maybeSingle()
  if (existing) {
    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.json({ brief: existing, source: 'persisted' })
  }

  // Compose on-demand.
  const inputs = await gatherBriefInputs(supabase, userId)
  const md = await composeBrief(inputs)
  const { row, error } = await persistBrief(supabase, {
    userId,
    kind: 'open',
    date: today,
    contentMd: md,
    watchlistQuotes: inputs.watchlistQuotes,
    marketContext:   inputs.marketContext,
  })
  if (error) return res.status(500).json({ error: error.message })

  res.setHeader('Cache-Control', 'private, max-age=60')
  return res.json({ brief: row, source: 'generated' })
}

// ── Dispatcher ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

  const kind = req.query?.kind
  if (kind === 'setups')         return handleSetups(req, res, supabase)
  if (kind === 'track-record')   return handleTrackRecord(req, res, supabase)
  if (kind === 'morning-brief')  return handleMorningBrief(req, res, supabase)
  return res.status(400).json({ error: 'Unknown kind; expected `setups`, `track-record`, or `morning-brief`' })
}

// Groq compose can take up to 10-12s on cold-start.
export const config = { maxDuration: 30 }
