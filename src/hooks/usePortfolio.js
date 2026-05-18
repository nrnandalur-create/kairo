import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── localStorage migration ──────────────────────────────────────────────────
async function migratePortfolioFromLocalStorage(userId) {
  const migrationKey = `kairo_portfolio_migrated_${userId}`
  if (localStorage.getItem(migrationKey)) return

  const raw = localStorage.getItem('kairo_portfolio')
  if (!raw) { localStorage.setItem(migrationKey, '1'); return }

  try {
    const holdings = JSON.parse(raw)  // [{ticker, shares, avgCost}, …]
    if (!Array.isArray(holdings) || holdings.length === 0) {
      localStorage.setItem(migrationKey, '1')
      return
    }

    const rows = holdings.map(h => ({
      user_id:  userId,
      ticker:   h.ticker.toUpperCase(),
      shares:   parseFloat(h.shares),
      avg_cost: parseFloat(h.avgCost ?? h.avg_cost ?? 0),
    }))

    const { error } = await supabase
      .from('portfolio_holdings')
      .upsert(rows, { onConflict: 'user_id,ticker', ignoreDuplicates: true })

    if (!error) {
      localStorage.removeItem('kairo_portfolio')
      localStorage.setItem(migrationKey, '1')
      console.log(`[kairo] Migrated ${rows.length} portfolio holdings to Supabase`)
    }
  } catch (e) {
    console.warn('[kairo] Portfolio migration failed', e)
  }
}

// ─── hook ────────────────────────────────────────────────────────────────────
export function usePortfolio(userId) {
  const [holdings, setHoldings]     = useState([])
  const [snapshots, setSnapshots]   = useState([])
  const [loading, setLoading]       = useState(true)

  const fetchHoldings = useCallback(async () => {
    if (!userId) { setHoldings([]); setLoading(false); return }

    const { data, error } = await supabase
      .from('portfolio_holdings')
      .select('*')
      .eq('user_id', userId)
      .order('added_at', { ascending: true })

    if (!error) setHoldings(data ?? [])
    setLoading(false)
  }, [userId])

  // Fetch last 90 days of daily snapshots for the performance chart
  const fetchSnapshots = useCallback(async () => {
    if (!userId) return

    const since = new Date()
    since.setDate(since.getDate() - 90)

    const { data } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value, gain_loss_pct')
      .eq('user_id', userId)
      .gte('snapshot_date', since.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true })

    setSnapshots(data ?? [])
  }, [userId])

  useEffect(() => {
    if (!userId) return
    migratePortfolioFromLocalStorage(userId).then(() => {
      fetchHoldings()
      fetchSnapshots()
    })
  }, [userId, fetchHoldings, fetchSnapshots])

  const upsertHolding = useCallback(async (ticker, shares, avgCost) => {
    if (!userId) return
    const { data, error } = await supabase
      .from('portfolio_holdings')
      .upsert({
        user_id:    userId,
        ticker:     ticker.toUpperCase(),
        shares:     parseFloat(shares),
        avg_cost:   parseFloat(avgCost),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,ticker' })
      .select()
      .single()

    if (!error) {
      setHoldings(prev => {
        const idx = prev.findIndex(h => h.ticker === ticker.toUpperCase())
        return idx >= 0
          ? prev.map((h, i) => i === idx ? data : h)
          : [...prev, data]
      })
    }
    return { error }
  }, [userId])

  const removeHolding = useCallback(async (ticker) => {
    if (!userId) return
    const { error } = await supabase
      .from('portfolio_holdings')
      .delete()
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase())

    if (!error) setHoldings(prev => prev.filter(h => h.ticker !== ticker.toUpperCase()))
    return { error }
  }, [userId])

  return { holdings, snapshots, loading, upsertHolding, removeHolding, refetch: fetchHoldings }
}
