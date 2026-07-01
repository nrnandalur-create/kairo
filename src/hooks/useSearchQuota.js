import { useCallback, useEffect, useState } from 'react'

// Free-tier daily quotas. Pro users bypass this entire hook via `isPro` in
// the consumer. The counters live in localStorage keyed by UTC date so they
// reset naturally at midnight UTC — no server round-trip needed.
export const FREE_SEARCH_LIMIT = 5
export const FREE_VERDICT_LIMIT = 1  // AI Recommendation reveals per day

const STORAGE_KEY = 'kairo_free_quota_v1'

function utcDateKey() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { date: utcDateKey(), searches: [], verdicts: 0 }
    const parsed = JSON.parse(raw)
    if (parsed?.date !== utcDateKey()) {
      // Different UTC day — reset.
      return { date: utcDateKey(), searches: [], verdicts: 0 }
    }
    return {
      date:     parsed.date,
      searches: Array.isArray(parsed.searches) ? parsed.searches : [],
      verdicts: Number.isFinite(+parsed.verdicts) ? +parsed.verdicts : 0,
    }
  } catch {
    return { date: utcDateKey(), searches: [], verdicts: 0 }
  }
}

function writeState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* non-fatal */ }
}

export function useSearchQuota({ isPro }) {
  const [state, setState] = useState(readState)

  // Wake-up recheck for tabs left open across the UTC-midnight boundary.
  useEffect(() => {
    const id = setInterval(() => {
      const fresh = readState()
      setState(s => (s.date === fresh.date ? s : fresh))
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const uniqueSearches = state.searches.length
  const searchesRemaining = Math.max(0, FREE_SEARCH_LIMIT - uniqueSearches)
  const verdictsRemaining = Math.max(0, FREE_VERDICT_LIMIT - state.verdicts)

  // Register a search. Same ticker within the day only counts once.
  const registerSearch = useCallback((ticker) => {
    if (isPro || !ticker) return { ok: true, remaining: Infinity }
    setState(prev => {
      const key  = utcDateKey()
      const base = prev.date === key ? prev : { date: key, searches: [], verdicts: 0 }
      if (base.searches.includes(ticker)) return base
      const next = { ...base, searches: [...base.searches, ticker] }
      writeState(next)
      return next
    })
    return { ok: uniqueSearches < FREE_SEARCH_LIMIT, remaining: searchesRemaining - 1 }
  }, [isPro, uniqueSearches, searchesRemaining])

  const registerVerdictReveal = useCallback(() => {
    if (isPro) return { ok: true, remaining: Infinity }
    setState(prev => {
      const key  = utcDateKey()
      const base = prev.date === key ? prev : { date: key, searches: [], verdicts: 0 }
      const next = { ...base, verdicts: base.verdicts + 1 }
      writeState(next)
      return next
    })
    return { ok: state.verdicts < FREE_VERDICT_LIMIT, remaining: verdictsRemaining - 1 }
  }, [isPro, state.verdicts, verdictsRemaining])

  return {
    date:              state.date,
    searchesUsed:      uniqueSearches,
    searchesRemaining: isPro ? Infinity : searchesRemaining,
    canSearch:         isPro || uniqueSearches < FREE_SEARCH_LIMIT,
    verdictsUsed:      state.verdicts,
    verdictsRemaining: isPro ? Infinity : verdictsRemaining,
    canRevealVerdict:  isPro || state.verdicts < FREE_VERDICT_LIMIT,
    registerSearch,
    registerVerdictReveal,
    limits: { search: FREE_SEARCH_LIMIT, verdict: FREE_VERDICT_LIMIT },
  }
}
