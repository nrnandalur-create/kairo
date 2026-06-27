import { supabase } from '../lib/supabase'

// Persist a snapshot of "what Kairo said about this ticker for this user
// at this moment." Called every time the analyze pipeline completes
// successfully. Silent on failure — logging must never interrupt the user.
//
// Powers three downstream features:
//   - Verdict Memory: per-user diff between previous and current view
//   - Track Record: cross-user audited accuracy (after outcome cron)
//   - Replay Mode: scrub the chart and see what Kairo said that day
export async function logVerdict({ userId, ticker, aiData, marketData, indicators, profile }) {
  if (!userId || !ticker || !aiData) return null
  try {
    const { data, error } = await supabase
      .from('verdict_history')
      .insert({
        user_id:     userId,
        ticker:      ticker.toUpperCase(),
        verdict:     aiData.recommendation,
        confidence:  aiData.confidence,
        risk_level:  aiData.riskLevel,
        price:       marketData?.quote?.c,
        rsi:         indicators?.rsi  ?? null,
        macd:        indicators?.macd ?? null,
        bb_position: indicators?.bb   ?? null,
        summary:     aiData.summary   ?? null,
        sector:      profile?.finnhubIndustry ?? null,
      })
      .select('id')
      .single()
    if (error) return null
    return data
  } catch { return null }
}

// "Last time you looked at TICKER" — the previous snapshot (excluding right
// now). Drives the Verdict Memory banner.
export async function fetchPreviousVerdict({ userId, ticker, currentId }) {
  if (!userId || !ticker) return null
  try {
    let q = supabase
      .from('verdict_history')
      .select('*')
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase())
      .order('viewed_at', { ascending: false })
      .limit(2)
    const { data, error } = await q
    if (error || !data) return null
    // First row is the current snapshot we just inserted; second is the previous.
    const previous = currentId
      ? data.find(r => r.id !== currentId)
      : data[1]
    return previous ?? null
  } catch { return null }
}

// All snapshots for this user+ticker, oldest-first. Drives the Recommendation
// card sparkline of personal view history + Replay scrubber.
export async function fetchUserHistory({ userId, ticker, limit = 50 }) {
  if (!userId || !ticker) return []
  try {
    const { data, error } = await supabase
      .from('verdict_history')
      .select('id, verdict, confidence, price, viewed_at')
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase())
      .order('viewed_at', { ascending: true })
      .limit(limit)
    if (error) return []
    return data ?? []
  } catch { return [] }
}
