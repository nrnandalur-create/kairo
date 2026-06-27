import { supabase } from '../lib/supabase'

// Conviction Log — capture and read the user's "why" for each position.
//
// Capture happens on first MyPosition fill per ticker (soft prompt). The
// thesis is one sentence, optional. 30 days later a cron fires the AI
// follow-up using captured_verdict + captured_price as anchors.

export async function fetchLatestConviction({ userId, ticker }) {
  if (!userId || !ticker) return null
  try {
    const { data } = await supabase
      .from('conviction_entries')
      .select('id, thesis, captured_verdict, captured_confidence, captured_price, created_at')
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ?? null
  } catch { return null }
}

export async function saveConviction({ userId, ticker, thesis, capturedVerdict, capturedConfidence, capturedPrice }) {
  if (!userId || !ticker || !thesis?.trim()) return null
  try {
    const { data, error } = await supabase
      .from('conviction_entries')
      .insert({
        user_id:             userId,
        ticker:              ticker.toUpperCase(),
        thesis:              thesis.trim().slice(0, 280),
        captured_verdict:    capturedVerdict ?? null,
        captured_confidence: capturedConfidence ?? null,
        captured_price:      capturedPrice ?? null,
      })
      .select('id, thesis, captured_verdict, captured_confidence, captured_price, created_at')
      .single()
    if (error) return null
    return data
  } catch { return null }
}

export async function fetchAllConvictions({ userId, limit = 50 }) {
  if (!userId) return []
  try {
    const { data } = await supabase
      .from('conviction_entries')
      .select('id, ticker, thesis, captured_verdict, captured_confidence, captured_price, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return data ?? []
  } catch { return [] }
}
