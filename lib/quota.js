// Server quota wrapper around the atomic consume_analyze_quota Postgres RPC.
//
// The AUTHORITATIVE check-and-increment happens in the database (see
// supabase/migrations/20260819_daily_usage_quota.sql) so it is transaction-safe
// under concurrency. This module just calls it with the authenticated user id
// and today's UTC date.
//
// `applyQuotaDecision` below is a PURE JavaScript mirror of the SQL logic. It is
// the reference implementation the unit tests exercise, and it MUST be kept in
// sync with the RPC — both encode the same rules:
//   * search: 5 unique tickers / UTC day (repeat tickers are free)
//   * verdict: 1 / UTC day
//   * mode 'verdict'  consumes search(ticker) + verdict
//   * mode 'analysis' consumes search(ticker)
//   * mode 'followup'/'compare' consume verdict

export const QUOTA_LIMITS = { search: 5, verdict: 1 }

// UTC calendar day key, e.g. "2026-08-19".
export function utcDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

// Pure decision function. `state` is { searchedTickers: string[], verdictCount: number }.
// Returns { state, allowed, quota, limit, remaining } WITHOUT mutating the input.
// Mirrors public.consume_analyze_quota exactly.
export function applyQuotaDecision(state, mode, ticker) {
  const searched = Array.isArray(state?.searchedTickers) ? [...state.searchedTickers] : []
  const verdicts = Number.isFinite(state?.verdictCount) ? state.verdictCount : 0
  const sym = String(ticker ?? '').toUpperCase()
  const isNewTicker = sym !== '' && !searched.includes(sym)
  const S = QUOTA_LIMITS.search
  const V = QUOTA_LIMITS.verdict

  const deny = (quota, limit) => ({
    state: { searchedTickers: searched, verdictCount: verdicts },
    allowed: false, quota, limit, remaining: 0,
  })

  if (mode === 'analysis') {
    if (isNewTicker && searched.length >= S) return deny('search', S)
    const nextSearched = isNewTicker ? [...searched, sym] : searched
    return {
      state: { searchedTickers: nextSearched, verdictCount: verdicts },
      allowed: true, quota: 'search', limit: S,
      remaining: Math.max(0, S - nextSearched.length),
    }
  }

  if (mode === 'verdict') {
    if (isNewTicker && searched.length >= S) return deny('search', S)
    if (verdicts >= V) return deny('verdict', V)
    const nextSearched = isNewTicker ? [...searched, sym] : searched
    return {
      state: { searchedTickers: nextSearched, verdictCount: verdicts + 1 },
      allowed: true, quota: 'verdict', limit: V,
      remaining: Math.max(0, V - (verdicts + 1)),
    }
  }

  if (mode === 'followup' || mode === 'compare') {
    if (verdicts >= V) return deny('verdict', V)
    return {
      state: { searchedTickers: searched, verdictCount: verdicts + 1 },
      allowed: true, quota: 'verdict', limit: V,
      remaining: Math.max(0, V - (verdicts + 1)),
    }
  }

  return deny('unknown', 0)
}

// Consume quota for an authenticated user via the atomic RPC. Returns
// { allowed, quota, limit, remaining }. Throws only on an unexpected DB error;
// callers translate `allowed:false` into a 429.
export async function consumeAnalyzeQuota(admin, userId, mode, ticker, now = new Date()) {
  const { data, error } = await admin.rpc('consume_analyze_quota', {
    p_user:   userId,
    p_date:   utcDateKey(now),
    p_mode:   mode,
    p_ticker: ticker ?? null,
  })
  if (error) throw new Error(error.message ?? 'quota check failed')
  // supabase returns the jsonb result directly.
  return {
    allowed:   !!data?.allowed,
    quota:     data?.quota ?? 'unknown',
    limit:     data?.limit ?? 0,
    remaining: data?.remaining ?? 0,
  }
}
