import { useState, useCallback } from 'react'

const KEY = 'kairo_watchlist'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') }
  catch { return [] }
}

export function useWatchlist() {
  const [tickers, setTickers] = useState(load)

  const save = useCallback(list => {
    setTickers(list)
    localStorage.setItem(KEY, JSON.stringify(list))
  }, [])

  const add    = useCallback(t => {
    const sym = t.toUpperCase()
    setTickers(prev => {
      if (prev.includes(sym)) return prev
      const next = [...prev, sym]
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const remove = useCallback(t => {
    const sym = t.toUpperCase()
    setTickers(prev => {
      const next = prev.filter(x => x !== sym)
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const has = useCallback(t => tickers.includes(t.toUpperCase()), [tickers])

  return { tickers, add, remove, has }
}
