import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── localStorage migration ──────────────────────────────────────────────────
// On first login we read whatever the user had saved locally, push it to
// Supabase, then clear the local key so the migration only runs once.
async function migrateFromLocalStorage(userId) {
  const migrationKey = `kairo_migrated_${userId}`
  if (localStorage.getItem(migrationKey)) return          // already done

  const raw = localStorage.getItem('kairo_watchlist')
  if (!raw) {
    localStorage.setItem(migrationKey, '1')
    return
  }

  try {
    const tickers = JSON.parse(raw)                       // ['AAPL','TSLA',…]
    if (!Array.isArray(tickers) || tickers.length === 0) {
      localStorage.setItem(migrationKey, '1')
      return
    }

    const rows = tickers.map(ticker => ({ user_id: userId, ticker: ticker.toUpperCase() }))
    const { error } = await supabase
      .from('watchlists')
      .upsert(rows, { onConflict: 'user_id,ticker', ignoreDuplicates: true })

    if (!error) {
      localStorage.removeItem('kairo_watchlist')
      localStorage.setItem(migrationKey, '1')
      console.log(`[kairo] Migrated ${rows.length} watchlist tickers to Supabase`)
    }
  } catch (e) {
    console.warn('[kairo] localStorage migration failed', e)
  }
}

// ─── hook ────────────────────────────────────────────────────────────────────
export function useWatchlist(userId) {
  const [watchlist, setWatchlist]   = useState([])
  const [loading, setLoading]       = useState(true)

  // Fetch watchlist from Supabase
  const fetchWatchlist = useCallback(async () => {
    if (!userId) { setWatchlist([]); setLoading(false); return }

    const { data, error } = await supabase
      .from('watchlists')
      .select('*')
      .eq('user_id', userId)
      .order('added_at', { ascending: true })

    if (!error) setWatchlist(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    migrateFromLocalStorage(userId).then(fetchWatchlist)
  }, [userId, fetchWatchlist])

  const addTicker = useCallback(async (ticker, note = null) => {
    if (!userId) return
    const { data, error } = await supabase
      .from('watchlists')
      .upsert({ user_id: userId, ticker: ticker.toUpperCase(), note },
               { onConflict: 'user_id,ticker' })
      .select()
      .single()

    if (!error) setWatchlist(prev => {
      const exists = prev.find(w => w.ticker === ticker.toUpperCase())
      return exists ? prev : [...prev, data]
    })
    return { error }
  }, [userId])

  const removeTicker = useCallback(async (ticker) => {
    if (!userId) return
    const { error } = await supabase
      .from('watchlists')
      .delete()
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase())

    if (!error) setWatchlist(prev => prev.filter(w => w.ticker !== ticker.toUpperCase()))
    return { error }
  }, [userId])

  const updateNote = useCallback(async (ticker, note) => {
    if (!userId) return
    const { error } = await supabase
      .from('watchlists')
      .update({ note })
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase())

    if (!error) setWatchlist(prev =>
      prev.map(w => w.ticker === ticker.toUpperCase() ? { ...w, note } : w)
    )
    return { error }
  }, [userId])

  const setAlert = useCallback(async (ticker, alertPrice, alertDirection) => {
    if (!userId) return
    const { error } = await supabase
      .from('watchlists')
      .update({ alert_price: alertPrice, alert_direction: alertDirection })
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase())

    if (!error) setWatchlist(prev =>
      prev.map(w => w.ticker === ticker.toUpperCase()
        ? { ...w, alert_price: alertPrice, alert_direction: alertDirection }
        : w
      )
    )
    return { error }
  }, [userId])

  return { watchlist, loading, addTicker, removeTicker, updateNote, setAlert, refetch: fetchWatchlist }
}
