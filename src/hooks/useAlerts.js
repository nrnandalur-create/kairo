import { useState, useCallback } from 'react'

const KEY = 'kairo_alerts'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  catch { return {} }
}

export function useAlerts() {
  const [alerts, setAlerts] = useState(load)

  const setAlert = useCallback((ticker, target, stop) => {
    const sym = ticker.toUpperCase()
    const t   = target !== '' && target != null ? +target : null
    const s   = stop   !== '' && stop   != null ? +stop   : null
    setAlerts(prev => {
      const next = { ...prev }
      if (!t && !s) { delete next[sym] }
      else          { next[sym] = { target: t, stop: s } }
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clearAlert = useCallback((ticker) => {
    setAlerts(prev => {
      const next = { ...prev }
      delete next[ticker.toUpperCase()]
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const getAlert = useCallback((ticker) => alerts[ticker?.toUpperCase()] ?? null, [alerts])

  return { alerts, setAlert, clearAlert, getAlert }
}
