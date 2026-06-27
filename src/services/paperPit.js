import { supabase } from '../lib/supabase'

const STARTING_CASH = 25_000

// Simple grade rule — same logic the Kairo AI would use as a sanity check.
// BUY at low confidence + buying at high RSI = bad. Aligned action gets A/B.
function gradeTrade({ side, verdict, confidence }) {
  if (!verdict || confidence == null) return { grade: 'B', reason: 'No verdict context — graded average by default.' }
  const aligned =
    (side === 'buy'  && verdict === 'BUY')  ||
    (side === 'sell' && verdict === 'SELL')
  const opposed =
    (side === 'buy'  && verdict === 'SELL') ||
    (side === 'sell' && verdict === 'BUY')

  if (aligned && confidence >= 80) return { grade: 'A',  reason: `${side.toUpperCase()} agreed with Kairo's ${verdict} at ${confidence}% — high-conviction entry.` }
  if (aligned && confidence >= 65) return { grade: 'A-', reason: `${side.toUpperCase()} agreed with Kairo's ${verdict} at ${confidence}% — solid context.` }
  if (aligned)                     return { grade: 'B+', reason: `${side.toUpperCase()} agreed with Kairo's ${verdict} but conviction was only ${confidence}%.` }
  if (opposed)                     return { grade: 'D',  reason: `${side.toUpperCase()} against Kairo's ${verdict} verdict (${confidence}% conf) — high risk of being wrong.` }
  return { grade: 'C+', reason: `${side.toUpperCase()} on a HOLD verdict — neutral context.` }
}

export async function ensureBalance(userId) {
  if (!userId) return null
  const { data } = await supabase.from('paper_balances').select('cash').eq('user_id', userId).maybeSingle()
  if (data) return data
  const { data: created } = await supabase
    .from('paper_balances')
    .insert({ user_id: userId, cash: STARTING_CASH })
    .select('cash')
    .single()
  return created
}

export async function fetchAllTrades({ userId, limit = 100 }) {
  if (!userId) return []
  const { data } = await supabase
    .from('paper_trades')
    .select('*')
    .eq('user_id', userId)
    .order('traded_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// Derive current holdings from the trade log.
export function computeHoldings(trades) {
  const map = {}
  for (const t of [...trades].reverse()) {
    const cur = map[t.ticker] ?? { ticker: t.ticker, shares: 0, totalCost: 0 }
    if (t.side === 'buy') {
      cur.shares    += Number(t.shares)
      cur.totalCost += Number(t.shares) * Number(t.fill_price)
    } else {
      // Selling reduces shares + proportionally reduces basis.
      const remaining = cur.shares - Number(t.shares)
      if (remaining > 0 && cur.shares > 0) cur.totalCost = cur.totalCost * (remaining / cur.shares)
      else cur.totalCost = 0
      cur.shares = Math.max(0, remaining)
    }
    map[t.ticker] = cur
  }
  return Object.values(map)
    .filter(h => h.shares > 0)
    .map(h => ({ ...h, avgCost: h.totalCost / h.shares }))
}

export async function executeTrade({ userId, ticker, side, shares, currentPrice, aiData }) {
  if (!userId || !ticker || !shares || !currentPrice) {
    return { error: 'Missing required fields' }
  }
  const shareCount = Number(shares)
  const price      = Number(currentPrice)
  if (!(shareCount > 0)) return { error: 'Shares must be positive' }
  if (!(price > 0))      return { error: 'Invalid quote' }

  // Apply 5bps "slippage" — modest realism.
  const slip = side === 'buy' ? 1.0005 : 0.9995
  const fillPrice = price * slip
  const notional  = fillPrice * shareCount

  const balance = await ensureBalance(userId)
  if (!balance) return { error: 'Could not load paper balance' }

  let newCash = balance.cash
  if (side === 'buy') {
    if (notional > balance.cash) return { error: `Insufficient cash ($${balance.cash.toFixed(2)} available)` }
    newCash = balance.cash - notional
  } else {
    // Verify position size
    const trades = await fetchAllTrades({ userId })
    const holding = computeHoldings(trades).find(h => h.ticker === ticker.toUpperCase())
    if (!holding || holding.shares < shareCount) return { error: 'You do not own that many shares' }
    newCash = balance.cash + notional
  }

  const { grade, reason } = gradeTrade({
    side,
    verdict:    aiData?.recommendation,
    confidence: aiData?.confidence,
  })

  const { data, error } = await supabase
    .from('paper_trades')
    .insert({
      user_id:           userId,
      ticker:            ticker.toUpperCase(),
      side,
      shares:            shareCount,
      fill_price:        fillPrice,
      kairo_verdict:     aiData?.recommendation ?? null,
      kairo_confidence:  aiData?.confidence ?? null,
      grade,
      grade_reason:      reason,
    })
    .select('*')
    .single()
  if (error) return { error: error.message }

  await supabase
    .from('paper_balances')
    .update({ cash: newCash, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  return { trade: data, newCash }
}
