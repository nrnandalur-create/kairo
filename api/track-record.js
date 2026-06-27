// Public read-only endpoint serving the Track Record page aggregates.
// No auth — receipts are deliberately public. Uses the Supabase service role
// to read across all users while returning only anonymized aggregates.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function aggregate(rows, horizonCol) {
  // Returns { count, avgReturn, hitRate } for verdicts that have an
  // evaluated outcome in this horizon. Hit rate is "verdict + outcome agreed":
  // BUY → return > 0, SELL → return < 0, HOLD → |return| < 3%.
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

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

  const { data, error } = await supabase
    .from('verdict_history')
    .select('verdict, confidence, sector, price, price_at_5d, price_at_30d, price_at_90d')
    .limit(5000)

  if (error) return res.status(500).json({ error: error.message })
  if (!data?.length) {
    return res.json({
      total:   0,
      message: 'Track record is empty — Kairo is still accumulating verdicts.',
    })
  }

  const byVerdict = { BUY: [], HOLD: [], SELL: [] }
  for (const r of data) {
    if (byVerdict[r.verdict]) byVerdict[r.verdict].push(r)
  }

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
